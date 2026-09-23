// A JSON-RPC endpoint that serves a chain the benchmark makes up as it goes.
//
// The performance scenarios read real chain data, because throughput is only
// interesting over data an indexer will really meet. Reliability is the other
// way round: the interesting moments - the chain rewriting itself, the node
// going away mid-batch, a token whose `symbol()` answers nothing - either
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
// longer on the chain - exactly the failure the scenario is looking for.
//
// This is deliberately not rpc-mock.ts. That endpoint sits in front of a real
// node and answers one method itself; this one has no upstream at all, and
// every method it does not implement is an error rather than a passthrough -
// a tool reaching for something the mock chain has not defined should surface
// as a failed scenario, not as an unexplained hang.

import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { acceptWebSocket, type WsConnection } from "./ws-server.ts";
import { TRANSFER_TOPIC } from "../../cases/lib/hypersync.ts";

/**
 * Port the mock chain listens on by default. Distinct from the contract-call
 * endpoint, so a scenario can run both at once.
 */
export const CHAIN_PORT = 19_879;

/** The methods a "missing" fault answers with null. */
const BLOCK_LOOKUPS = ["eth_getBlockByNumber", "eth_getBlockByHash"];

const JSON_HEADERS = { "content-type": "application/json" };

/**
 * The bloom filter a block carries: all ones when it has logs, all zeros when
 * it has none.
 *
 * A real node derives this from the logs, and indexers check it in both
 * directions. Ponder checks that a log it was given is present in the block's
 * bloom, and stopped on a bloom of zeros: "Log not found in block.logsBloom".
 * The Squid SDK checks the converse - that a non-empty bloom is matched by
 * logs - and stopped on a bloom of ones over an empty block: "got 0 log
 * records from eth_getLogs, but logs bloom is not empty". Each found one half,
 * and only a real indexer could have.
 *
 * Deriving it per block satisfies both without a keccak256 this harness has no
 * dependency for. All ones is a legal bloom for a block that has logs: a bloom
 * is allowed false positives and not false negatives, so every membership test
 * passes and nothing is ever wrongly skipped. All zeros is the exact answer for
 * a block that has none.
 */
const BLOOM_SET = `0x${"f".repeat(512)}`;
const BLOOM_EMPTY = `0x${"0".repeat(512)}`;
const bloomFor = (logCount: number) => (logCount > 0 ? BLOOM_SET : BLOOM_EMPTY);

/**
 * How far below the start block a hash lookup will walk.
 *
 * Ancestors are derived rather than stored, so a hash that belongs to none of
 * them can only be ruled out by trying heights. A tool asks for an ancestor to
 * find the parent of where it starts, never for one thousands of blocks down,
 * so a bounded walk answers every real question and a wrong hash costs a
 * bounded loop instead of a walk to block zero.
 */
const ANCESTOR_SEARCH_DEPTH = 1_000;

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
   * The height from which `firstLogIndex` applies; below it, logs are numbered
   * from zero.
   *
   * This exists because of what a real run showed. An indexer that refuses a
   * log index above the signed 32-bit maximum stops there, and when every
   * block carried one, that single refusal was also the answer to every other
   * question the scenario wanted to ask - the tool never reached the blocks
   * they were about. Confining the hostile indices to the end of the chain
   * means each check gets put to a tool that is still running.
   */
  firstLogIndexFrom?: number;
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
   * answered as empty data (`0x`) - a contract that has no such function, or a
   * token whose `symbol()` returns nothing - which the indexer is expected to
   * store as a null rather than crash on.
   */
  calls?: Record<string, string | null>;
  /**
   * Override the listening port, so two chains can run side by side. Zero
   * takes whatever port is free, and `url` then names it.
   */
  port?: number;
  /**
   * A stretch of blocks that carry no logs at all, inclusive. A tool whose
   * progress is only ever the last row it wrote appears to stall here, which
   * is the point: an indexer has to be able to say where it is in a range that
   * gave it nothing to do.
   */
  emptyRange?: { from: number; to: number };
  /**
   * Overrides the amount a log carries, for the values a schema is most likely
   * to be wrong about. Returning null leaves the derived amount alone, so a
   * scenario can single out one block without flattening the rest.
   */
  amountOf?: (block: number, index: number) => bigint | null;
  /**
   * The strings a `MetadataUpdated` event carries, given the block it is in.
   *
   * The chain emits one every `METADATA_EVERY` blocks, as the last log of the
   * block. It exists because a tool that is configured for two events and
   * quietly indexes one is invisible to a suite that only ever looks at the
   * other - and a tool really did that, silently, in an earlier revision of
   * this benchmark. The strings are ordinary by default; a scenario that
   * wants hostile ones overrides this.
   */
  metadataOf?: (block: number) => { symbol: string; name: string };
}

/**
 * `MetadataUpdated(string,string)`, the second event the chain emits.
 *
 * keccak256 of the signature, written down rather than computed: the chain
 * has no keccak of its own (its hashes are sha256, which no indexer checks),
 * and a topic that disagreed with the one in the projects' ABIs would fail
 * every tool at once with nobody able to tell which side was wrong.
 */
export const METADATA_TOPIC =
  "0x30f5c4b652f95e2a697bda3258896c421eee4f29adce8fe38060f47f7aed91ad";

/** How often the chain emits one, in blocks. */
export const METADATA_EVERY = 25;

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

/**
 * ABI-encodes two `string` arguments as one event data field.
 *
 * Both are dynamic, so the head is two offsets and the tail is the two
 * lengths and their padded bytes, which is what every decoder in every one of
 * these tools expects to find.
 */
export function encodeTwoStrings(first: string, second: string): string {
  const body = (value: string) => {
    const bytes = Buffer.from(value, "utf8");
    const padded = Buffer.concat([bytes, Buffer.alloc((32 - (bytes.length % 32)) % 32)]);
    return `${word(BigInt(bytes.length))}${padded.toString("hex")}`;
  };
  const head = body(first);
  return `0x${word(64n)}${word(BigInt(64 + head.length / 2))}${head}${body(second)}`;
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
   *   error     - a JSON-RPC error, the way a node reports an internal fault
   *   status    - a non-2xx HTTP status with a provider's error body
   *   timeout   - the request is accepted and never answered, which is the
   *               failure mode a retry policy is least likely to survive
   *   close     - the socket is destroyed mid-request
   *   truncated - HTTP 200, the right Content-Type, and a body that stops
   *               in the middle of the JSON. A client that trusts a 200
   *               without checking that the body parses treats this as an
   *               empty result set, which is silent data loss rather than
   *               an error to retry
   *   missing   - a well-formed `null` for a block that does exist, which
   *               is what a load-balanced endpoint answers when the head was
   *               announced by one machine and asked of another behind it
   *
   * "missing" is a fault about a block rather than about a request, so it
   * answers eth_getBlockByNumber and eth_getBlockByHash and leaves every
   * other method alone.
   */
  kind: "error" | "status" | "timeout" | "close" | "truncated" | "missing";
  /** Methods to break. Unset breaks every method. */
  methods?: string[];
  /** How many requests to break before healing. Unset means until cleared. */
  count?: number;
  /**
   * Share of requests to break, from 0 to 1. Unset breaks every one.
   *
   * A provider does not fail every request and then stop failing any: it
   * fails some of them, for a while, and the difference is the whole point -
   * a retry that works because the next attempt succeeds is a different code
   * path from one that has to wait out a total outage. The dice are seeded,
   * so a run that finds something can be run again.
   */
  rate?: number;
  /** Seed for the dice, so a partial fault is a repeatable one. */
  seed?: number;
  status?: number;
  code?: number;
  message?: string;
}

export interface ChainStats {
  requests: number;
  /**
   * Methods the chain was asked for and does not implement, by name.
   *
   * This is the honest accounting of the mock's own limits. A generated chain
   * serves the methods someone thought to write, and an indexer reaching for
   * one of the others gets an error - which, left unexamined, looks exactly
   * like an indexer that cannot index. Every entry here is a bug report
   * against this file, and the harness treats a scenario that saw one as
   * unmeasured rather than failed: a tool cannot be marked down for a question
   * the benchmark could not answer.
   *
   * Deliberately not cleared by reset(), which scenarios call to count
   * requests over a window. A refusal is a fact about the whole run.
   */
  refused: Record<string, number>;
  /** Requests broken by an injected fault. */
  faulted: number;
  /** Per-method counts, so a scenario can assert a tool split its ranges. */
  methods: Record<string, number>;
  /** Widest `eth_getLogs` range asked for, in blocks. */
  widestRange: number;
  /**
   * `eth_getLogs` requests refused by each cap. The range cap is checked
   * first, so a request refused for its result count had already come in
   * under the range cap.
   */
  capped: { range: number; results: number };
  /**
   * `eth_subscribe("newHeads")` calls over the WebSocket. Like `refused`, it
   * survives reset(): whether a tool subscribes at all is a fact about the
   * run, and it decides whether a subscription check can be asked.
   */
  subscriptions: number;
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
   *   "changed" - the replacements carry different values, so an indexer that
   *               did not roll back holds rows that were never on the chain
   *   "dropped" - the replacements carry nothing, so the events have to be
   *               deleted rather than merely overwritten, which is the case
   *               an upsert-only rollback silently fails
   */
  reorg(opts: {
    depth: number;
    /**
     * Blocks the replacement chain has, beyond or short of the ones it
     * replaces. Negative makes the chain genuinely shorter than it was, which
     * a real chain does whenever the heavier fork is the shorter one - and
     * which an indexer that only ever moves its head forward cannot express.
     */
    extend?: number;
    logs?: "changed" | "dropped";
  }): {
    from: number;
    to: number;
  };
  /** The block at a height on the current chain, or null if it is not there. */
  blockAt(height: number): MockBlock | null;
  /**
   * Every metadata event the chain currently holds, oldest first.
   *
   * The second event type's ground truth, kept apart from `rows` because the
   * two are compared against different tables. A tool configured for both
   * events that indexes only the transfers is wrong in a way no amount of
   * looking at transfers can see, and that is not hypothetical: it is what an
   * earlier revision of this benchmark found a no-code project doing.
   */
  metadataRows(upToHeight?: number): MetadataRow[];
  /**
   * Every log the chain currently holds, oldest first - the ground truth a
   * scenario compares an indexer's tables against.
   *
   * Derived from the chain as it stands right now, which is the only reading
   * that means anything after a reorg: rows discarded by one are not in here,
   * and a tool still holding them is holding rows that are not on the chain.
   */
  rows(upToHeight?: number): ChainRow[];
  /** Break the endpoint. Call with null to heal it. */
  fail(fault: Fault | null): void;
  /**
   * Change the provider's caps while a tool is running, so a scenario can see
   * whether one that narrowed its queries under a cap ever widens them again.
   * An undefined field clears that cap.
   */
  setLimits(limits: { maxBlockRange?: number; maxLogsPerResponse?: number }): void;
  /**
   * Answer from `blocks` behind the real head, the way one node of a
   * load-balanced endpoint does. Blocks above the lagging head are reported as
   * missing too, because a replica that has not seen them does not have them.
   * Zero restores the truth.
   */
  setHeadLag(blocks: number): void;
  /**
   * Serve every log twice in the same response. A chain cannot do this; a
   * provider stitching two backends together can, and an indexer that writes
   * what it is given ends up with each transfer stored twice.
   */
  setDuplicateLogs(on: boolean): void;
  /**
   * Stop announcing new blocks to WebSocket subscribers, without closing the
   * socket or refusing anything asked over it. A load-balanced endpoint whose
   * subscription backend died does exactly this: the connection stays up,
   * pings are answered, and the heads simply stop coming.
   */
  setSubscriptionsQuiet(on: boolean): void;
  stats(): ChainStats;
  reset(): void;
}

/** One log, in the shape the scenarios compare an indexer's table against. */
export interface ChainRow {
  block: number;
  logIndex: number;
  amount: bigint;
  /** Lowercase, `0x`-prefixed - the form every comparison normalises to. */
  from: string;
  to: string;
}

/** One MetadataUpdated event, as the chain holds it. */
export interface MetadataRow {
  block: number;
  logIndex: number;
  symbol: string;
  name: string;
}

export interface ChainMock {
  /** What the indexers are pointed at. */
  url: string;
  /**
   * The same endpoint over a WebSocket: every method the HTTP side serves,
   * plus `eth_subscribe("newHeads")`. Faults are injected on the HTTP side
   * only - the scenarios that hand a tool this URL are about how fast it hears
   * of a block, and whether it notices when it stops hearing.
   */
  wsUrl: string;
  control: ChainControl;
  close(): Promise<void>;
}

// ── Server ─────────────────────────────────────────────────────────────

export async function startChainMock(spec: ChainSpec): Promise<ChainMock> {
  // A generated chain will serve whatever it is given, which is most of its
  // value and, here, a trap: an address one character too long went unnoticed
  // until a real indexer refused to start on it, because nothing between the
  // constant and the wire had any opinion about what an address is. A real
  // node would have rejected it in the first request.
  if (!/^0x[0-9a-fA-F]{40}$/.test(spec.contract)) {
    throw new Error(
      `${spec.contract} is not a 20-byte address, so no indexer will accept it ` +
        `as a contract (${(spec.contract.length - 2) / 2} bytes)`
    );
  }
  const firstLogIndex = spec.firstLogIndex ?? 0;
  // Mutable copies of the caps, so a scenario can lift them mid-run.
  let maxBlockRange = spec.maxBlockRange;
  let maxLogsPerResponse = spec.maxLogsPerResponse;
  let headLag = 0;
  let duplicateLogs = false;
  /** The canonical chain, oldest first. Index 0 is `spec.startBlock`. */
  const chain: MockBlock[] = [];
  let stats = emptyStats();
  let fault: Fault | null = null;
  /** State of the dice a partial fault rolls. */
  let faultSeed = 0x9e_37_79_b9;

  function emptyStats(): ChainStats {
    return {
      requests: 0,
      faulted: 0,
      methods: {},
      widestRange: 0,
      refused: {},
      capped: { range: 0, results: 0 },
      subscriptions: 0,
    };
  }

  function append(epoch: number, logs: boolean): MockBlock {
    const number = spec.startBlock + chain.length;
    const parent = chain[chain.length - 1];
    const block: MockBlock = {
      number,
      hash: hex32("block", number, epoch),
      // Below the start block the chain continues into derived ancestors, so
      // the first served block's parent is a hash that can actually be
      // fetched. A tool that walks back one block from its start block finds a
      // chain rather than a dead end.
      parentHash: parent?.hash ?? hex32("ancestor", number - 1),
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
  /** The metadata event a block carries, if it is one of the blocks that do. */
  function metadataOf(block: MockBlock): { symbol: string; name: string } | null {
    if (!block.logs) return null;
    if ((block.number - spec.startBlock) % METADATA_EVERY !== 0) return null;
    return (
      spec.metadataOf?.(block.number) ?? {
        symbol: `RLB${block.number % 1_000}`,
        name: `Reliability Token ${block.number}`,
      }
    );
  }

  function logsOf(block: MockBlock) {
    if (!block.logs) return [];
    const empty = spec.emptyRange;
    if (empty && block.number >= empty.from && block.number <= empty.to) return [];
    const metadata = metadataOf(block);
    const extra = metadata
      ? [
          {
            address: spec.contract,
            topics: [METADATA_TOPIC],
            data: encodeTwoStrings(metadata.symbol, metadata.name),
            blockNumber: quantity(block.number),
            blockHash: block.hash,
            transactionHash: hex32("tx", block.number, block.epoch, spec.logsPerBlock),
            transactionIndex: quantity(spec.logsPerBlock),
            logIndex: quantity(
              (block.number >= (spec.firstLogIndexFrom ?? spec.startBlock)
                ? firstLogIndex
                : 0) + spec.logsPerBlock
            ),
            removed: false,
          },
        ]
      : [];
    return Array.from({ length: spec.logsPerBlock }, (_, i) => {
      const logIndex =
        block.number >= (spec.firstLogIndexFrom ?? spec.startBlock) ? firstLogIndex + i : i;
      const from = hex20("from", block.number, i);
      const to = hex20("to", block.number, i);
      const amount =
        spec.amountOf?.(block.number, i) ??
        BigInt(block.number) * 1_000n + BigInt(block.epoch * 7 + i);
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
        logIndex: quantity(logIndex),
        removed: false,
      };
    }).concat(extra);
  }

  /**
   * A block below the chain's start block.
   *
   * Nothing is indexed down here, but tools ask: a chain head tracker walking
   * back for a parent, a client checking the network by reading an early
   * block. Answering null would be a hole in a chain that is supposed to be
   * ordinary everywhere except where a scenario made it strange, so ancestors
   * are derived on demand - hashes that chain together, no logs, no branch.
   */
  function ancestorAt(height: number): MockBlock {
    return {
      number: height,
      hash: hex32("ancestor", height),
      parentHash: hex32("ancestor", height - 1),
      timestamp: 1_700_000_000 - (spec.startBlock - height) * spec.blockTimeS,
      epoch: 0,
      logs: false,
      publishedAtMs: 0,
    };
  }

  /**
   * A block by hash, ancestors included.
   *
   * Graph Node starts by asking for the parent of its start block by hash, and
   * that parent is below the chain's start block - derived, never in `chain`.
   * Searching only the array answered null there, which reads to a tool as a
   * node that does not have the block it just named.
   */
  function blockByHash(hash: string): MockBlock | null {
    const inChain = chain.find(
      (b) => b.hash === hash && b.number <= servedHead()
    );
    if (inChain) return inChain;
    for (let height = spec.startBlock - 1; height >= 0; height--) {
      const ancestor = ancestorAt(height);
      if (ancestor.hash === hash) return ancestor;
      // Hashes are derived from the height alone, so a scan that has gone
      // deeper than any tool would ask is a hash that is not an ancestor.
      if (spec.startBlock - height > ANCESTOR_SEARCH_DEPTH) break;
    }
    return null;
  }

  function blockAt(height: number): MockBlock | null {
    if (height < spec.startBlock) return height >= 0 ? ancestorAt(height) : null;
    // A lagging replica does not have the blocks it has not seen. Hiding them
    // as well as the head keeps the lie self-consistent: a tool that asks for
    // a block the head does not cover gets the same answer a real replica
    // would give it, rather than a block from a future it denies having.
    if (headLag > 0 && height > servedHead()) return null;
    return chain[height - spec.startBlock] ?? null;
  }

  /** The head as the endpoint currently admits to, which may be behind. */
  function servedHead(): number {
    const real = chain[chain.length - 1]?.number ?? spec.startBlock;
    return Math.max(spec.startBlock, real - headLag);
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
      logsBloom: bloomFor(logs.length),
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
      // A whole transaction, including the fields a type-2 one must carry.
      // Leaving the fee fields out is the kind of gap only a real indexer
      // finds: the historical path never asks for transactions, and the
      // realtime path fetches whole blocks and converts every field it knows
      // about - Ponder turned the missing maxFeePerGas into "Cannot convert
      // undefined to a BigInt" and took its own process down with it.
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
            maxFeePerGas: "0x7",
            maxPriorityFeePerGas: "0x1",
            accessList: [],
            input: "0x",
            type: "0x2",
            chainId: quantity(spec.chainId),
            yParity: "0x0",
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
    // "safe" and "finalized" are deliberately the head too. A scenario that
    // wanted a finality lag would have to say so; making one up here would
    // silently change what every reorg scenario is testing.
    if (["latest", "pending", "safe", "finalized"].includes(ref)) {
      return servedHead();
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
    const head = servedHead();
    const from = Math.max(blockRef(filter?.fromBlock ?? "earliest") ?? spec.startBlock, spec.startBlock);
    const to = Math.min(blockRef(filter?.toBlock ?? "latest") ?? head, head);
    stats.widestRange = Math.max(stats.widestRange, to - from + 1);
    if (maxBlockRange && to - from + 1 > maxBlockRange) {
      stats.capped.range++;
      throw rpcFault(-32_600, `query exceeds max block range ${maxBlockRange}`);
    }
    const out: ReturnType<typeof logsOf> = [];
    for (let height = from; height <= to; height++) {
      const block = blockAt(height);
      if (block) out.push(...filterLogs(logsOf(block), filter));
    }
    if (maxLogsPerResponse && out.length > maxLogsPerResponse) {
      stats.capped.results++;
      throw rpcFault(-32_005, `query returned more than ${maxLogsPerResponse} results`);
    }
    // Doubling happens last, so it is the response that is wrong rather than
    // the chain: the same log, twice, with the same block, hash and index.
    return duplicateLogs ? out.flatMap((log) => [log, log]) : out;
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
        return quantity(servedHead());
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
        const block = blockByHash(params[0] as string);
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
        // does with nothing - store a null, or fall over.
        return answer ?? "0x";
      }
      default: {
        const method = req.method ?? "an unnamed method";
        stats.refused[method] = (stats.refused[method] ?? 0) + 1;
        throw rpcFault(-32_601, `the mock chain does not serve ${method}`);
      }
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
      logsBloom: bloomFor(1),
      status: "0x1",
      type: "0x2",
    };
  }

  /**
   * Seeded dice, so a partial fault is reproducible.
   *
   * mulberry32: four lines, no dependency, and good enough to decide whether
   * this request is one of the unlucky ones. A run that finds data loss at a
   * five percent fault rate has to be runnable again with the same rolls, or
   * the finding is an anecdote.
   */
  function roll(): number {
    faultSeed = (faultSeed + 0x6d_2b_79_f5) >>> 0;
    let t = faultSeed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** Whether the injected fault applies to this request, and consumes it. */
  function takeFault(methods: string[]): Fault | null {
    if (!fault) return null;
    if (fault.methods && !methods.some((m) => fault!.methods!.includes(m))) return null;
    // The dice are rolled before the count is spent, so a rate and a count
    // together mean "break this many, one in every so often" rather than
    // "break the first few and then roll".
    if (fault.rate !== undefined && roll() >= fault.rate) return null;
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
        if (injected.kind === "missing") {
          // A block that exists, answered as though it does not. Only the
          // block lookups: a provider behind a load balancer serves this from
          // a replica that is a second behind, and everything else it answers
          // is fine. eth_getLogs is deliberately left alone, so the tool is
          // told about logs in a block it is then told does not exist.
          const answers = entries.map((entry) => ({
            jsonrpc: "2.0",
            id: entry?.id ?? null,
            result: BLOCK_LOOKUPS.includes(entry?.method ?? "") ? null : handle(entry),
          }));
          res
            .writeHead(200, JSON_HEADERS)
            .end(JSON.stringify(Array.isArray(payload) ? answers : answers[0]));
          return;
        }
        if (injected.kind === "truncated") {
          // A 200, the right content type, and a body that stops mid-object.
          // Content-Length is deliberately not sent: a chunked response that
          // ends early is what a proxy timing out mid-stream produces, and a
          // client that never checks the parse reads it as nothing at all.
          const answers = entries.map((entry) => {
            try {
              return { jsonrpc: "2.0", id: entry?.id ?? null, result: handle(entry) };
            } catch {
              return { jsonrpc: "2.0", id: entry?.id ?? null, result: null };
            }
          });
          const whole = JSON.stringify(Array.isArray(payload) ? answers : answers[0]);
          res.writeHead(200, JSON_HEADERS).end(whole.slice(0, Math.ceil(whole.length / 2)));
          return;
        }
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

  // ── The same endpoint over a WebSocket ──
  //
  // Everything the HTTP side answers, answered the same way, plus the one
  // thing only a socket can do: tell a subscriber about a block the moment it
  // exists. No faults here - see ChainMock.wsUrl.
  const sockets = new Set<WsConnection>();
  const subscribers = new Map<WsConnection, Set<string>>();
  let nextSubscription = 1;
  let subscriptionsQuiet = false;

  /** Tell every newHeads subscriber about a block, unless the feed is quiet. */
  function announce(block: MockBlock) {
    if (subscriptionsQuiet || subscribers.size === 0) return;
    const header = serializeBlock(block, false);
    for (const [connection, ids] of subscribers) {
      for (const subscription of ids) {
        connection.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_subscription",
            params: { subscription, result: header },
          })
        );
      }
    }
  }

  function answerOverSocket(text: string, connection: WsConnection) {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      connection.send(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32_700, message: "parse error" } })
      );
      return;
    }
    const entries = (Array.isArray(payload) ? payload : [payload]) as {
      id?: unknown;
      method?: string;
      params?: unknown[];
    }[];
    stats.requests++;
    const answers = entries.map((entry) => {
      const method = entry?.method ?? "unknown";
      stats.methods[method] = (stats.methods[method] ?? 0) + 1;
      const id = entry?.id ?? null;
      try {
        if (method === "eth_subscribe") {
          if (entry.params?.[0] !== "newHeads") {
            stats.refused[`eth_subscribe(${String(entry.params?.[0])})`] =
              (stats.refused[`eth_subscribe(${String(entry.params?.[0])})`] ?? 0) + 1;
            throw rpcFault(-32_601, `the mock chain does not serve that subscription`);
          }
          const subscription = `0x${(nextSubscription++).toString(16)}`;
          if (!subscribers.has(connection)) subscribers.set(connection, new Set());
          subscribers.get(connection)!.add(subscription);
          stats.subscriptions++;
          return { jsonrpc: "2.0", id, result: subscription };
        }
        if (method === "eth_unsubscribe") {
          const removed = subscribers.get(connection)?.delete(String(entry.params?.[0])) ?? false;
          return { jsonrpc: "2.0", id, result: removed };
        }
        return { jsonrpc: "2.0", id, result: handle(entry) };
      } catch (err) {
        const code = err instanceof RpcFault ? err.code : -32_603;
        return { jsonrpc: "2.0", id, error: { code, message: (err as Error).message } };
      }
    });
    connection.send(JSON.stringify(Array.isArray(payload) ? answers : answers[0]));
  }

  server.on("upgrade", (req, socket) => {
    const connection = acceptWebSocket(req, socket, answerOverSocket, (closed) => {
      sockets.delete(closed);
      subscribers.delete(closed);
    });
    if (connection) sockets.add(connection);
  });

  const requested = spec.port ?? CHAIN_PORT;
  await new Promise<void>((resolve, reject) => {
    // A listen failure has to reject rather than reach the process as an
    // unhandled "error" event: a scenario that could not start its chain
    // should fail as that, not take the whole run down with a stack trace.
    server.once("error", reject);
    // Every interface, not just the loopback: SubQuery's node runs inside a
    // container and reaches the host through the docker gateway, which is a
    // different interface. A chain bound to 127.0.0.1 is a chain that one of
    // the seven tools cannot see at all.
    server.listen(requested, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  // Port 0 asks the OS for a free one, which is what the tests use: a fixed
  // port is a test that cannot run while a scenario is running, and the two
  // want to run side by side.
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : requested;

  // One block to start from, so the chain is never empty when a tool asks.
  append(0, true);

  const control: ChainControl = {
    head: () => chain[chain.length - 1]?.number ?? spec.startBlock,
    advance(blocks = 1) {
      const epoch = chain[chain.length - 1]?.epoch ?? 0;
      for (let i = 0; i < blocks; i++) announce(append(epoch, true));
    },
    reorg({ depth, extend = 0, logs = "changed" }) {
      const head = chain[chain.length - 1];
      if (!head) throw new Error("cannot reorg an empty chain");
      const cut = Math.min(depth, chain.length - 1);
      // At least one block back, however short the replacement was asked to
      // be: a fork that replaces blocks with nothing is not a fork.
      const replacements = Math.max(1, cut + extend);
      const from = head.number - cut + 1;
      const epoch = head.epoch + 1;
      chain.length = chain.length - cut;
      // Announced block by block, as a node announces the new branch it
      // switched to.
      for (let i = 0; i < replacements; i++) announce(append(epoch, logs !== "dropped"));
      return { from, to: chain[chain.length - 1].number };
    },
    blockAt,
    metadataRows(upToHeight) {
      const out: MetadataRow[] = [];
      for (const block of chain) {
        if (upToHeight !== undefined && block.number > upToHeight) break;
        const metadata = metadataOf(block);
        if (!metadata) continue;
        const log = logsOf(block).find((entry) => entry.topics[0] === METADATA_TOPIC);
        if (!log) continue;
        out.push({
          block: block.number,
          logIndex: Number(BigInt(log.logIndex)),
          ...metadata,
        });
      }
      return out;
    },
    rows(upToHeight) {
      const out: ChainRow[] = [];
      for (const block of chain) {
        if (upToHeight !== undefined && block.number > upToHeight) break;
        for (const log of logsOf(block)) {
          if (log.topics[0] !== TRANSFER_TOPIC) continue;
          out.push({
            block: block.number,
            logIndex: Number(BigInt(log.logIndex)),
            amount: BigInt(log.data),
            from: `0x${log.topics[1].slice(-40)}`,
            to: `0x${log.topics[2].slice(-40)}`,
          });
        }
      }
      return out;
    },
    fail(next) {
      fault = next;
      if (next?.seed !== undefined) faultSeed = next.seed >>> 0;
    },
    setLimits(limits) {
      maxBlockRange = limits.maxBlockRange;
      maxLogsPerResponse = limits.maxLogsPerResponse;
    },
    setHeadLag(blocks) {
      headLag = Math.max(0, blocks);
    },
    setDuplicateLogs(on) {
      duplicateLogs = on;
    },
    setSubscriptionsQuiet(on) {
      subscriptionsQuiet = on;
    },
    stats: () => ({
      ...stats,
      methods: { ...stats.methods },
      capped: { ...stats.capped },
      refused: { ...stats.refused },
    }),
    reset() {
      // Refusals survive: they are the mock's own shortcomings rather than
      // part of whatever window a scenario is counting.
      const { refused, subscriptions } = stats;
      stats = emptyStats();
      stats.refused = refused;
      stats.subscriptions = subscriptions;
    },
  };

  return {
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    control,
    close: () =>
      new Promise<void>((resolve) => {
        // An upgraded socket is no longer the HTTP server's to close.
        for (const connection of sockets) connection.close();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
