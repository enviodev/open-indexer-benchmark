// A JSON-RPC endpoint that serves a chain the benchmark makes up as it goes.
//
// The performance scenarios read real chain data, because throughput is only
// interesting over data an indexer will really meet. Reliability is the other
// way round: the interesting moments — the chain rewriting itself, the node
// going away mid-batch, a token whose `symbol()` answers nothing — either
// cannot be arranged on a real chain at all, or cannot be arranged twice the
// same way. So the reliability scenarios do not read a chain. They serve one.
//
// Everything here is deterministic and driven from the test: blocks appear
// when `advance()` is called, the chain rewrites itself when `reorg()` is
// called, and requests fail when `fail()` says they should. Two runs of the
// same scenario see exactly the same chain, which is what makes a score a
// score rather than a sample.
//
// A block's contents are derived from its number and the epoch of the branch
// it is on, never stored from a previous life. That is what makes a reorg
// legible: the replacement block at height N is a different block with
// different logs, and an indexer that kept the old one is holding data no
// longer on the chain — exactly the failure the scenario is looking for.
//
// This is deliberately not rpc-mock.ts. That endpoint sits in front of a real
// node and answers one method itself; this one has no upstream at all, and
// every method it does not implement is an error rather than a passthrough —
// a tool reaching for something the mock chain has not defined should surface
// as a failed scenario, not as an unexplained hang.

import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { TRANSFER_TOPIC } from "./hypersync.ts";

/**
 * Port the mock chain listens on by default. Distinct from the contract-call
 * endpoint, so a scenario can run both at once.
 */
export const CHAIN_PORT = 19_879;

const JSON_HEADERS = { "content-type": "application/json" };

// ── The chain ──────────────────────────────────────────────────────────

export interface MockBlock {
  number: number;
  hash: string;
  parentHash: string;
  /** Seconds, as a chain reports them. */
  timestamp: number;
  /**
   * Which branch this block belongs to. Zero is the original chain; every
   * reorg bumps it, so a replacement block at the same height hashes
   * differently and carries different logs.
   */
  epoch: number;
  /** Whether this block carries its logs at all. A reorg may drop them. */
  logs: boolean;
  /**
   * Wall-clock milliseconds when this block first became the head. The head
   * latency scenario measures from here to the row landing in the database,
   * so it has to be stamped where the block is published rather than derived
   * from the block timestamp, which is chain time and says nothing about when
   * the indexer could first have seen it.
   */
  publishedAtMs: number;
}

export interface ChainSpec {
  chainId: number;
  /** First block the chain serves. Nothing below it exists. */
  startBlock: number;
  /** Chain-time seconds between blocks, for the `timestamp` field. */
  blockTimeS: number;
  /** Transfer logs each block carries. */
  logsPerBlock: number;
  /** The token contract every log belongs to. */
  contract: string;
  /**
   * The log index the first log of a block is given. The default is 0; a
   * scenario pins it near the top of an unsigned 32-bit integer to reproduce
   * the synthetic log indices some providers emit, which have halted at least
   * one indexer outright (ponder-sh/ponder#2373).
   */
  firstLogIndex?: number;
  /**
   * Reject an `eth_getLogs` spanning more than this many blocks, the way a
   * provider does. A tool that never splits its range simply stops here, which
   * is the finding.
   */
  maxBlockRange?: number;
  /** Reject a response that would carry more than this many logs, likewise. */
  maxLogsPerResponse?: number;
  /**
   * What `eth_call` answers, keyed by the 4-byte selector. A value of null is
   * answered as empty data (`0x`) — a contract that has no such function, or a
   * token whose `symbol()` returns nothing — which the indexer is expected to
   * store as a null rather than crash on.
   */
  calls?: Record<string, string | null>;
  /** Override the listening port, so two chains can run side by side. */
  port?: number;
}

/** `symbol()`, `name()`, `decimals()`, `totalSupply()`. */
export const SELECTORS = {
  symbol: "0x95d89b41",
  name: "0x06fdde03",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
} as const;

function hex32(...parts: (string | number)[]): string {
  return `0x${createHash("sha256").update(parts.join(":")).digest("hex")}`;
}

function hex20(...parts: (string | number)[]): string {
  return `0x${createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 40)}`;
}

function quantity(n: number | bigint): string {
  return `0x${n.toString(16)}`;
}

/** A 32-byte word, right-aligned, as ABI encoding wants it. */
function word(value: string | bigint): string {
  const raw = typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/, "");
  return raw.padStart(64, "0");
}

/** ABI-encodes a `string` return value, for a token metadata answer. */
export function encodeString(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  const padded = Buffer.concat([
    bytes,
    Buffer.alloc((32 - (bytes.length % 32)) % 32),
  ]);
  return `0x${word(32n)}${word(BigInt(bytes.length))}${padded.toString("hex")}`;
}

// ── Faults ─────────────────────────────────────────────────────────────

export interface Fault {
  /**
   * How the endpoint misbehaves.
   *
   *   error     — a JSON-RPC error, the way a node reports an internal fault
   *   status    — a non-2xx HTTP status with a provider's error body
   *   timeout   — the request is accepted and never answered, which is the
   *               failure mode a retry policy is least likely to survive
   *   close     — the socket is destroyed mid-request
   */
  kind: "error" | "status" | "timeout" | "close";
  /** Methods to break. Unset breaks every method. */
  methods?: string[];
  /** How many requests to break before healing. Unset means until cleared. */
  count?: number;
  status?: number;
  code?: number;
  message?: string;
}

export interface ChainStats {
  requests: number;
  /** Requests broken by an injected fault. */
  faulted: number;
  /** Per-method counts, so a scenario can assert a tool split its ranges. */
  methods: Record<string, number>;
  /** Widest `eth_getLogs` range asked for, in blocks. */
  widestRange: number;
}

export interface ChainControl {
  /** Highest block currently on the chain. */
  head(): number;
  /** Append blocks to the head. */
  advance(blocks?: number): void;
  /**
   * Rewrite the last `depth` blocks and replace them with `depth + extend`
   * fresh ones, so the head moves forward across the rewrite the way a real
   * reorg does. Returns the range that changed.
   *
   * `logs` says what happens to the events in the rewritten blocks:
   *
   *   "changed" — the replacements carry different values, so an indexer that
   *               did not roll back holds rows that were never on the chain
   *   "dropped" — the replacements carry nothing, so the events have to be
   *               deleted rather than merely overwritten, which is the case
   *               an upsert-only rollback silently fails
   */
  reorg(opts: { depth: number; extend?: number; logs?: "changed" | "dropped" }): {
    from: number;
    to: number;
  };
  /** The block at a height on the current chain, or null if it is not there. */
  blockAt(height: number): MockBlock | null;
  /** Break the endpoint. Call with null to heal it. */
  fail(fault: Fault | null): void;
  stats(): ChainStats;
  reset(): void;
}

export interface ChainMock {
  /** What the indexers are pointed at. */
  url: string;
  control: ChainControl;
  close(): Promise<void>;
}

// ── Server ─────────────────────────────────────────────────────────────

export async function startChainMock(spec: ChainSpec): Promise<ChainMock> {
  const firstLogIndex = spec.firstLogIndex ?? 0;
  /** The canonical chain, oldest first. Index 0 is `spec.startBlock`. */
  const chain: MockBlock[] = [];
  let stats = emptyStats();
  let fault: Fault | null = null;

  function emptyStats(): ChainStats {
    return { requests: 0, faulted: 0, methods: {}, widestRange: 0 };
  }

  function append(epoch: number, logs: boolean): MockBlock {
    const number = spec.startBlock + chain.length;
    const parent = chain[chain.length - 1];
    const block: MockBlock = {
      number,
      hash: hex32("block", number, epoch),
      // The genesis of this mock is the first block it serves; its parent is a
      // hash nothing will ever ask about, which is fine — no indexer walks
      // below its own start block.
      parentHash: parent?.hash ?? hex32("parent", number, epoch),
      timestamp: 1_700_000_000 + (number - spec.startBlock) * spec.blockTimeS,
      epoch,
      logs,
      publishedAtMs: Date.now(),
    };
    chain.push(block);
    return block;
  }

  /**
   * The logs a block carries, derived from the block rather than stored.
   *
   * The amount encodes both the height and the epoch, which is what lets a
   * scenario tell "rolled the reorg back and re-indexed" apart from "kept the
   * row it already had": the two differ in value, not merely in count.
   */
  function logsOf(block: MockBlock) {
    if (!block.logs) return [];
    return Array.from({ length: spec.logsPerBlock }, (_, i) => {
      const from = hex20("from", block.number, i);
      const to = hex20("to", block.number, i);
      const amount = BigInt(block.number) * 1_000n + BigInt(block.epoch * 7 + i);
      return {
        address: spec.contract,
        topics: [TRANSFER_TOPIC, `0x${word(from)}`, `0x${word(to)}`],
        data: `0x${word(amount)}`,
        blockNumber: quantity(block.number),
        blockHash: block.hash,
        // One transaction per log keeps receipts trivial and means a tool that
        // keys on (txHash, logIndex) sees the same uniqueness a chain gives it.
        transactionHash: hex32("tx", block.number, block.epoch, i),
        transactionIndex: quantity(i),
        logIndex: quantity(firstLogIndex + i),
        removed: false,
      };
    });
  }

  function blockAt(height: number): MockBlock | null {
    return chain[height - spec.startBlock] ?? null;
  }

  function serializeBlock(block: MockBlock, fullTx: boolean) {
    const logs = logsOf(block);
    return {
      number: quantity(block.number),
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: quantity(block.timestamp),
      // Enough of the header for the tools that decode one wholesale rather
      // than reading the fields they need.
      nonce: "0x0000000000000000",
      sha3Uncles: hex32("uncles", block.number),
      logsBloom: `0x${"0".repeat(512)}`,
      transactionsRoot: hex32("txroot", block.number, block.epoch),
      stateRoot: hex32("stateroot", block.number, block.epoch),
      receiptsRoot: hex32("receipts", block.number, block.epoch),
      miner: hex20("miner"),
      difficulty: "0x0",
      totalDifficulty: "0x0",
      extraData: "0x",
      size: "0x400",
      gasLimit: "0x1c9c380",
      gasUsed: quantity(21_000 * logs.length),
      baseFeePerGas: "0x7",
      uncles: [],
      transactions: fullTx
        ? logs.map((log, i) => ({
            hash: log.transactionHash,
            nonce: quantity(i),
            blockHash: block.hash,
            blockNumber: quantity(block.number),
            transactionIndex: quantity(i),
            from: hex20("from", block.number, i),
            to: spec.contract,
            value: "0x0",
            gas: "0x5208",
            gasPrice: "0x7",
            input: "0x",
            type: "0x2",
            chainId: quantity(spec.chainId),
            v: "0x0",
            r: hex32("r", block.number, i),
            s: hex32("s", block.number, i),
          }))
        : logs.map((log) => log.transactionHash),
    };
  }

  function blockRef(ref: unknown): number | null {
    if (typeof ref === "number") return ref;
    if (typeof ref !== "string") return null;
    const head = chain[chain.length - 1];
    // "safe" and "finalized" are deliberately the head too. A scenario that
    // wanted a finality lag would have to say so; making one up here would
    // silently change what every reorg scenario is testing.
    if (["latest", "pending", "safe", "finalized"].includes(ref)) {
      return head ? head.number : spec.startBlock;
    }
    if (ref === "earliest") return spec.startBlock;
    const parsed = Number.parseInt(ref, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getLogs(filter: Record<string, unknown>) {
    if (typeof filter?.blockHash === "string") {
      const block = chain.find((b) => b.hash === filter.blockHash);
      // A hash that is no longer on the chain is not an empty answer: it is
      // gone, and a tool told "no logs" would record a reorged block as one
      // that simply held nothing.
      if (!block) throw rpcFault(-32_000, "unknown block");
      return filterLogs(logsOf(block), filter);
    }
    const head = chain[chain.length - 1]?.number ?? spec.startBlock;
    const from = Math.max(blockRef(filter?.fromBlock ?? "earliest") ?? spec.startBlock, spec.startBlock);
    const to = Math.min(blockRef(filter?.toBlock ?? "latest") ?? head, head);
    stats.widestRange = Math.max(stats.widestRange, to - from + 1);
    if (spec.maxBlockRange && to - from + 1 > spec.maxBlockRange) {
      throw rpcFault(
        -32_600,
        `query exceeds max block range ${spec.maxBlockRange}`
      );
    }
    const out: ReturnType<typeof logsOf> = [];
    for (let height = from; height <= to; height++) {
      const block = blockAt(height);
      if (block) out.push(...filterLogs(logsOf(block), filter));
    }
    if (spec.maxLogsPerResponse && out.length > spec.maxLogsPerResponse) {
      throw rpcFault(
        -32_005,
        `query returned more than ${spec.maxLogsPerResponse} results`
      );
    }
    return out;
  }

  function filterLogs(logs: ReturnType<typeof logsOf>, filter: Record<string, unknown>) {
    const addresses = new Set(
      (Array.isArray(filter?.address)
        ? filter.address
        : filter?.address
          ? [filter.address]
          : []
      ).map((a) => String(a).toLowerCase())
    );
    const topics = Array.isArray(filter?.topics) ? filter.topics : [];
    return logs.filter((log) => {
      if (addresses.size > 0 && !addresses.has(log.address.toLowerCase())) return false;
      return topics.every((want, i) => {
        if (want === null || want === undefined) return true;
        const options = (Array.isArray(want) ? want : [want]).map((t) =>
          String(t).toLowerCase()
        );
        return options.includes((log.topics[i] ?? "").toLowerCase());
      });
    });
  }

  /** An error a handler throws to have it returned as a JSON-RPC error. */
  class RpcFault extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  }
  const rpcFault = (code: number, message: string) => new RpcFault(code, message);

  function handle(req: { method?: string; params?: unknown[] }): unknown {
    const params = req.params ?? [];
    const head = chain[chain.length - 1];
    switch (req.method) {
      case "eth_chainId":
        return quantity(spec.chainId);
      case "net_version":
        return String(spec.chainId);
      case "web3_clientVersion":
        return "open-indexer-benchmark/chain-mock";
      case "eth_syncing":
        return false;
      case "eth_blockNumber":
        return quantity(head?.number ?? spec.startBlock);
      case "eth_gasPrice":
      case "eth_maxPriorityFeePerGas":
        return "0x7";
      case "eth_getBalance":
        return "0x0";
      case "eth_getCode":
        // Non-empty: a tool that checks whether the address it was pointed at
        // is a contract should find one.
        return "0x60806040";
      case "eth_getBlockByNumber": {
        const height = blockRef(params[0]);
        const block = height === null ? null : blockAt(height);
        return block ? serializeBlock(block, params[1] === true) : null;
      }
      case "eth_getBlockByHash": {
        const block = chain.find((b) => b.hash === params[0]);
        return block ? serializeBlock(block, params[1] === true) : null;
      }
      case "eth_getLogs":
        return getLogs((params[0] ?? {}) as Record<string, unknown>);
      case "eth_getBlockReceipts": {
        const height = blockRef(params[0]);
        const block = height === null ? null : blockAt(height);
        return block ? logsOf(block).map((log, i) => receiptOf(block, log, i)) : null;
      }
      case "eth_getTransactionReceipt": {
        for (const block of chain) {
          const logs = logsOf(block);
          const index = logs.findIndex((log) => log.transactionHash === params[0]);
          if (index >= 0) return receiptOf(block, logs[index], index);
        }
        return null;
      }
      case "eth_call": {
        const data = String((params[0] as { data?: string })?.data ?? "0x").toLowerCase();
        const answer = spec.calls?.[data.slice(0, 10)];
        // Both an undefined selector and an explicit null answer as empty
        // data. A contract with no such function returns nothing on a real
        // chain too, and what the scenario is watching is what the indexer
        // does with nothing — store a null, or fall over.
        return answer ?? "0x";
      }
      default:
        throw rpcFault(-32_601, `the mock chain does not serve ${req.method}`);
    }
  }

  function receiptOf(block: MockBlock, log: ReturnType<typeof logsOf>[number], i: number) {
    return {
      transactionHash: log.transactionHash,
      transactionIndex: quantity(i),
      blockHash: block.hash,
      blockNumber: quantity(block.number),
      from: hex20("from", block.number, i),
      to: spec.contract,
      cumulativeGasUsed: quantity(21_000 * (i + 1)),
      gasUsed: "0x5208",
      effectiveGasPrice: "0x7",
      contractAddress: null,
      logs: [log],
      logsBloom: `0x${"0".repeat(512)}`,
      status: "0x1",
      type: "0x2",
    };
  }

  /** Whether the injected fault applies to this request, and consumes it. */
  function takeFault(methods: string[]): Fault | null {
    if (!fault) return null;
    if (fault.methods && !methods.some((m) => fault!.methods!.includes(m))) return null;
    if (fault.count !== undefined) {
      if (fault.count <= 0) return null;
      fault.count--;
    }
    stats.faulted++;
    return fault;
  }

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      stats.requests++;
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
      } catch {
        res.writeHead(400, JSON_HEADERS).end(
          JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32_700, message: "parse error" } })
        );
        return;
      }
      const batch = Array.isArray(payload) ? payload : [payload];
      const entries = batch as { id?: unknown; method?: string; params?: unknown[] }[];
      for (const entry of entries) {
        stats.methods[entry?.method ?? "unknown"] =
          (stats.methods[entry?.method ?? "unknown"] ?? 0) + 1;
      }

      const injected = takeFault(entries.map((e) => e?.method ?? ""));
      if (injected) {
        if (injected.kind === "timeout") return; // Never answered, socket held.
        if (injected.kind === "close") return void res.destroy();
        if (injected.kind === "status") {
          res
            .writeHead(injected.status ?? 503, JSON_HEADERS)
            .end(JSON.stringify({ error: injected.message ?? "service unavailable" }));
          return;
        }
        const error = {
          code: injected.code ?? -32_000,
          message: injected.message ?? "internal error",
        };
        const body = entries.map((entry) => ({ jsonrpc: "2.0", id: entry?.id ?? null, error }));
        res
          .writeHead(injected.status ?? 200, JSON_HEADERS)
          .end(JSON.stringify(Array.isArray(payload) ? body : body[0]));
        return;
      }

      const answers = entries.map((entry) => {
        try {
          return { jsonrpc: "2.0", id: entry?.id ?? null, result: handle(entry) };
        } catch (err) {
          const code = err instanceof RpcFault ? err.code : -32_603;
          return {
            jsonrpc: "2.0",
            id: entry?.id ?? null,
            error: { code, message: (err as Error).message },
          };
        }
      });
      res
        .writeHead(200, JSON_HEADERS)
        .end(JSON.stringify(Array.isArray(payload) ? answers : answers[0]));
    });
  });

  const port = spec.port ?? CHAIN_PORT;
  await new Promise<void>((resolve, reject) => {
    // A listen failure has to reject rather than reach the process as an
    // unhandled "error" event: a scenario that could not start its chain
    // should fail as that, not take the whole run down with a stack trace.
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  // One block to start from, so the chain is never empty when a tool asks.
  append(0, true);

  const control: ChainControl = {
    head: () => chain[chain.length - 1]?.number ?? spec.startBlock,
    advance(blocks = 1) {
      const epoch = chain[chain.length - 1]?.epoch ?? 0;
      for (let i = 0; i < blocks; i++) append(epoch, true);
    },
    reorg({ depth, extend = 0, logs = "changed" }) {
      const head = chain[chain.length - 1];
      if (!head) throw new Error("cannot reorg an empty chain");
      const cut = Math.min(depth, chain.length - 1);
      const from = head.number - cut + 1;
      const epoch = head.epoch + 1;
      chain.length = chain.length - cut;
      for (let i = 0; i < cut + extend; i++) append(epoch, logs !== "dropped");
      return { from, to: chain[chain.length - 1].number };
    },
    blockAt,
    fail(next) {
      fault = next;
    },
    stats: () => ({ ...stats, methods: { ...stats.methods } }),
    reset() {
      stats = emptyStats();
    },
  };

  return {
    url: `http://127.0.0.1:${port}`,
    control,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
