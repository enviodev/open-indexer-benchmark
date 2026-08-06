// A JSON-RPC endpoint over the mock chain, with a fault switch.
//
// Every indexer under test speaks plain Ethereum JSON-RPC, so this is the only
// thing any of them has to be pointed at. It answers the methods an indexer
// actually calls while syncing, in the shapes a real node returns them —
// including the fields tools quietly depend on, like `logsBloom` and
// `totalDifficulty`, whose absence is diagnosed as a broken node rather than a
// broken mock.
//
// `faults` is mutable while the server is running. A scenario turns it on for a
// window, watches what the indexer does, turns it off, and then checks whether
// the tool caught up on its own — which is the whole question a reliability
// benchmark is asking.

import { createServer, type Server } from "node:http";
import { encodeStrings, encodeUint256, logsBloom, selector } from "./abi.ts";
import {
  CONTRACT,
  HOSTILE_NAME,
  HOSTILE_SYMBOL,
  type MockBlock,
  type MockChain,
  type MockLog,
} from "./chain.ts";

const hex = (value: number | bigint): string => `0x${value.toString(16)}`;

/** Faults the endpoint can inject. Every rate is a probability per request. */
export interface FaultConfig {
  /** HTTP 500, the shape of a provider having a bad minute. */
  httpErrorRate: number;
  /** HTTP 429 with a Retry-After header. */
  rateLimitRate: number;
  /** A 200 whose body is truncated JSON — the failure that breaks naive clients. */
  malformedRate: number;
  /** A well-formed JSON-RPC error object, as a node returns under load. */
  rpcErrorRate: number;
  /** Socket destroyed mid-response. */
  dropRate: number;
  /**
   * `null` for a block that does exist. Real nodes behind a load balancer do
   * this constantly: the head is announced by one machine and requested from
   * another that has not caught up yet.
   */
  missingBlockRate: number;
  /** Extra latency, in milliseconds, before answering. */
  delayMs: number;
}

const NO_FAULTS: FaultConfig = {
  httpErrorRate: 0,
  rateLimitRate: 0,
  malformedRate: 0,
  rpcErrorRate: 0,
  dropRate: 0,
  missingBlockRate: 0,
  delayMs: 0,
};

export interface RpcOptions {
  chainId?: number;
  /**
   * Largest span `eth_getLogs` will serve before refusing, as every public
   * provider does. Tools are expected to split their queries; one that does not
   * stalls, which is a finding rather than a mock bug.
   */
  maxLogRange?: number;
  /** Seed for the fault dice, so a chaotic run is still a repeatable one. */
  seed?: number;
}

export interface RpcStats {
  total: number;
  byMethod: Record<string, number>;
  /** Requests the fault switch spoiled, by kind. */
  faults: Record<string, number>;
}

/** Small deterministic PRNG — chaos has to be reproducible to be debuggable. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockRpcServer {
  readonly faults: FaultConfig = { ...NO_FAULTS };
  readonly stats: RpcStats = { total: 0, byMethod: {}, faults: {} };

  private server: Server | null = null;
  private port = 0;
  private readonly chain: MockChain;
  private readonly chainId: number;
  private readonly maxLogRange: number;
  private readonly random: () => number;
  private readonly log = process.env.RELIABILITY_RPC_LOG === "1";

  constructor(chain: MockChain, options: RpcOptions = {}) {
    this.chain = chain;
    this.chainId = options.chainId ?? 1;
    this.maxLogRange = options.maxLogRange ?? 10_000;
    this.random = mulberry32(options.seed ?? 0x5eed);
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The same endpoint as seen from inside a container on the default bridge. */
  get containerUrl(): string {
    return `http://host.docker.internal:${this.port}`;
  }

  listen(port = 0): Promise<number> {
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        void this.respond(body, res);
      });
    });
    // Long-lived pooled connections are how every client talks to a node;
    // without this the server closes them after 5s and tools log spurious
    // socket errors that look like faults the scenario did not inject.
    this.server.keepAliveTimeout = 120_000;
    this.server.headersTimeout = 125_000;
    return new Promise((resolve, reject) => {
      // Without this the promise never settles when the bind fails — say
      // because a previous run left the port held — and Node takes the process
      // down on the unhandled error rather than the scenario reporting why.
      this.server!.once("error", (err) => {
        this.server = null;
        reject(err);
      });
      this.server!.listen(port, "0.0.0.0", () => {
        const address = this.server!.address();
        this.port = typeof address === "object" && address ? address.port : port;
        resolve(this.port);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.closeAllConnections?.();
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  /** Restore the endpoint to answering everything correctly. */
  heal(): void {
    Object.assign(this.faults, NO_FAULTS);
  }

  private countFault(kind: string): void {
    this.stats.faults[kind] = (this.stats.faults[kind] ?? 0) + 1;
  }

  private async respond(body: string, res: import("node:http").ServerResponse) {
    if (this.faults.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.faults.delayMs));
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid JSON body" }));
      return;
    }

    const batch = Array.isArray(payload);
    const requests = (batch ? payload : [payload]) as {
      id?: unknown;
      method?: string;
      params?: unknown[];
    }[];

    for (const request of requests) {
      this.stats.total++;
      const method = request.method ?? "unknown";
      this.stats.byMethod[method] = (this.stats.byMethod[method] ?? 0) + 1;
      if (this.log) console.log(`  rpc ← ${method} ${JSON.stringify(request.params ?? [])}`);
    }

    // Transport-level faults hit the whole HTTP request, batch and all, which
    // is exactly how they arrive in production.
    if (this.random() < this.faults.dropRate) {
      this.countFault("dropped");
      res.destroy();
      return;
    }
    if (this.random() < this.faults.httpErrorRate) {
      this.countFault("http500");
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("upstream error");
      return;
    }
    if (this.random() < this.faults.rateLimitRate) {
      this.countFault("http429");
      res.writeHead(429, { "content-type": "text/plain", "retry-after": "1" });
      res.end("rate limit exceeded");
      return;
    }
    if (this.random() < this.faults.malformedRate) {
      this.countFault("malformed");
      res.writeHead(200, { "content-type": "application/json" });
      // A body that starts like a valid response and stops mid-object: the
      // failure mode a client that trusts the content-type gets wrong.
      res.end('{"jsonrpc":"2.0","id":1,"result":{"number":"0x');
      return;
    }

    const responses = requests.map((request) => this.handle(request));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(batch ? responses : responses[0]));
  }

  private handle(request: { id?: unknown; method?: string; params?: unknown[] }) {
    const id = request.id ?? null;
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
    const fail = (code: number, message: string) => ({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    });

    if (this.random() < this.faults.rpcErrorRate) {
      this.countFault("rpcError");
      return fail(-32603, "internal error: request timed out");
    }

    const params = request.params ?? [];
    try {
      switch (request.method) {
        case "eth_chainId":
          return ok(hex(this.chainId));
        case "net_version":
          return ok(String(this.chainId));
        case "web3_clientVersion":
          return ok("open-indexer-benchmark/mock-chain");
        case "net_listening":
          return ok(true);
        case "eth_syncing":
          return ok(false);
        case "eth_protocolVersion":
          return ok("0x41");

        case "eth_blockNumber":
          return ok(hex(this.chain.height));

        case "eth_getBlockByNumber": {
          const block = this.resolveTag(params[0] as string);
          if (!block || this.dropBlock()) return ok(null);
          return ok(this.blockJson(block, params[1] === true));
        }
        case "eth_getBlockByHash": {
          const block = this.chain.blockByHash(String(params[0]));
          if (!block || this.dropBlock()) return ok(null);
          return ok(this.blockJson(block, params[1] === true));
        }
        case "eth_getBlockTransactionCountByNumber": {
          const block = this.resolveTag(params[0] as string);
          return ok(block ? hex(block.transactions.length) : null);
        }

        case "eth_getLogs":
          return this.getLogs(params[0] as Record<string, unknown>, ok, fail);

        case "eth_getBlockReceipts": {
          const block = this.resolveTag(params[0] as string);
          if (!block) return ok(null);
          return ok(block.transactions.map((_, i) => this.receiptJson(block, i)));
        }
        case "eth_getTransactionReceipt": {
          const found = this.findTransaction(String(params[0]));
          return ok(found ? this.receiptJson(found.block, found.index) : null);
        }
        case "eth_getTransactionByHash": {
          const found = this.findTransaction(String(params[0]));
          return ok(found ? this.transactionJson(found.block, found.index) : null);
        }

        case "eth_call":
          return ok(this.call(params[0] as { to?: string; data?: string }));
        case "eth_getCode":
          // Non-empty for the indexed contract, so a tool that checks whether
          // an address is a contract before subscribing to it gets a yes.
          return ok(
            String(params[0]).toLowerCase() === CONTRACT ? "0x60806040" : "0x"
          );
        case "eth_getBalance":
        case "eth_getStorageAt":
          return ok(`0x${"0".repeat(64)}`);
        case "eth_getTransactionCount":
          return ok("0x0");
        case "eth_estimateGas":
          return ok("0x5208");
        case "eth_gasPrice":
          return ok("0x3b9aca00");
        case "eth_maxPriorityFeePerGas":
          return ok("0x3b9aca00");
        case "eth_feeHistory":
          return ok({
            oldestBlock: hex(Math.max(0, this.chain.height - 1)),
            baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
            gasUsedRatio: [0.5],
            reward: [["0x3b9aca00"]],
          });

        default:
          return fail(-32601, `the mock chain does not implement ${request.method}`);
      }
    } catch (err) {
      return fail(-32603, err instanceof Error ? err.message : String(err));
    }
  }

  /** True when this request should pretend a block it holds does not exist. */
  private dropBlock(): boolean {
    if (this.random() >= this.faults.missingBlockRate) return false;
    this.countFault("missingBlock");
    return true;
  }

  private resolveTag(tag: string): MockBlock | undefined {
    switch (tag) {
      case "latest":
      case "pending":
        return this.chain.head;
      case "earliest":
        return this.chain.blockByNumber(0);
      case "finalized":
      case "safe":
        return this.chain.blockByNumber(this.chain.finalizedHeight);
      default:
        return this.chain.blockByNumber(Number(BigInt(tag)));
    }
  }

  /**
   * Height a range endpoint refers to. A numeric tag is taken at face value
   * even when it is past the head — asking for blocks that do not exist yet is
   * how a tool polls, and answering it with the head's logs instead of an empty
   * result would hand every tool data it never asked for.
   */
  private tagHeight(tag: unknown, fallback: number): number {
    if (tag === undefined || tag === null) return fallback;
    const text = String(tag);
    if (text.startsWith("0x")) return Number(BigInt(text));
    if (/^\d+$/.test(text)) return Number(text);
    return this.resolveTag(text)?.number ?? fallback;
  }

  private getLogs(
    filter: Record<string, unknown>,
    ok: (result: unknown) => unknown,
    fail: (code: number, message: string) => unknown
  ) {
    const blockHash = filter.blockHash ? String(filter.blockHash) : undefined;
    const from = blockHash ? 0 : this.tagHeight(filter.fromBlock, 0);
    const to = blockHash ? 0 : this.tagHeight(filter.toBlock, this.chain.height);

    if (!blockHash && to - from + 1 > this.maxLogRange) {
      // The error shape public providers return, so a tool that recognises it
      // and halves its range gets the chance to.
      return fail(
        -32005,
        `query exceeds max block range of ${this.maxLogRange}`
      );
    }

    const address = filter.address
      ? (Array.isArray(filter.address) ? filter.address : [filter.address]).map(String)
      : undefined;

    const matches = this.chain.getLogs({
      fromBlock: from,
      toBlock: to,
      blockHash,
      address,
      topics: filter.topics as (string | string[] | null)[] | undefined,
    });
    return ok(matches.map(({ log, block }) => this.logJson(log, block)));
  }

  private findTransaction(hash: string): { block: MockBlock; index: number } | null {
    // Transaction hashes are not indexed: the scenarios never look one up by
    // hash outside the block that carries it, and walking the canonical chain
    // keeps a reorg from resurrecting an orphaned transaction here.
    for (let n = this.chain.height; n >= 0; n--) {
      const block = this.chain.blockByNumber(n);
      const index = block?.transactions.findIndex(
        (tx) => tx.hash.toLowerCase() === hash.toLowerCase()
      );
      if (block && index !== undefined && index >= 0) return { block, index };
    }
    return null;
  }

  /** The view calls a tool makes when it first meets an ERC-20 contract. */
  private call(params: { to?: string; data?: string }): string {
    const data = (params.data ?? "0x").toLowerCase();
    if (data.startsWith(selector("symbol()"))) return encodeStrings([HOSTILE_SYMBOL]);
    if (data.startsWith(selector("name()"))) return encodeStrings([HOSTILE_NAME]);
    if (data.startsWith(selector("decimals()"))) return `0x${encodeUint256(18n)}`;
    if (data.startsWith(selector("totalSupply()"))) {
      return `0x${encodeUint256(1_000_000_000n)}`;
    }
    if (data.startsWith(selector("balanceOf(address)"))) {
      return `0x${encodeUint256(1_000n)}`;
    }
    return "0x";
  }

  // ── JSON shapes ──────────────────────────────────────────────────────

  private logJson(log: MockLog, block: MockBlock) {
    return {
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: hex(block.number),
      blockHash: block.hash,
      blockTimestamp: hex(block.timestamp),
      transactionHash: log.transactionHash,
      transactionIndex: hex(log.transactionIndex),
      logIndex: hex(log.logIndex),
      // Logs are only ever served for the chain as it stands, so nothing served
      // here is a removal notice; a client learns about a reorg from the block
      // hashes, which is how a real node reports it over HTTP too.
      removed: false,
    };
  }

  private transactionJson(block: MockBlock, index: number) {
    const tx = block.transactions[index];
    return {
      blockHash: block.hash,
      blockNumber: hex(block.number),
      from: tx.from,
      gas: "0x5208",
      gasPrice: "0x3b9aca00",
      maxFeePerGas: "0x3b9aca00",
      maxPriorityFeePerGas: "0x3b9aca00",
      hash: tx.hash,
      input: tx.input,
      nonce: hex(index),
      to: tx.to,
      transactionIndex: hex(index),
      value: "0x0",
      type: "0x2",
      accessList: [],
      chainId: hex(this.chainId),
      v: "0x1",
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
      yParity: "0x1",
    };
  }

  private receiptJson(block: MockBlock, index: number) {
    const tx = block.transactions[index];
    const logs = block.logs
      .filter((log) => log.transactionIndex === index)
      .map((log) => this.logJson(log, block));
    return {
      transactionHash: tx.hash,
      transactionIndex: hex(index),
      blockHash: block.hash,
      blockNumber: hex(block.number),
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: hex(21_000 * (index + 1)),
      gasUsed: "0x5208",
      contractAddress: null,
      logs,
      logsBloom: logsBloom(logs.flatMap((log) => [log.address, ...log.topics])),
      status: "0x1",
      effectiveGasPrice: "0x3b9aca00",
      type: "0x2",
    };
  }

  private blockJson(block: MockBlock, fullTransactions: boolean) {
    const bloom = logsBloom(
      block.logs.flatMap((log) => [log.address, ...log.topics])
    );
    return {
      number: hex(block.number),
      hash: block.hash,
      parentHash: block.parentHash,
      nonce: "0x0000000000000000",
      sha3Uncles: `0x${"00".repeat(32)}`,
      logsBloom: bloom,
      transactionsRoot: `0x${"00".repeat(32)}`,
      stateRoot: `0x${"00".repeat(32)}`,
      receiptsRoot: `0x${"00".repeat(32)}`,
      miner: "0x0000000000000000000000000000000000000000",
      difficulty: "0x0",
      totalDifficulty: "0x0",
      extraData: "0x",
      size: hex(512 + block.transactions.length * 128),
      gasLimit: "0x1c9c380",
      gasUsed: hex(21_000 * block.transactions.length),
      timestamp: hex(block.timestamp),
      transactions: fullTransactions
        ? block.transactions.map((_, i) => this.transactionJson(block, i))
        : block.transactions.map((tx) => tx.hash),
      uncles: [],
      baseFeePerGas: "0x3b9aca00",
      mixHash: `0x${"00".repeat(32)}`,
      withdrawals: [],
      withdrawalsRoot: `0x${"00".repeat(32)}`,
      blobGasUsed: "0x0",
      excessBlobGas: "0x0",
      parentBeaconBlockRoot: `0x${"00".repeat(32)}`,
    };
  }
}
