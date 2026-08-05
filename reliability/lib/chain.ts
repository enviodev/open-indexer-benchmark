// A synthetic Ethereum chain the harness owns outright.
//
// Reliability is about what an indexer does when the chain misbehaves, and a
// real chain will not misbehave on request: it will not reorganise eight blocks
// deep while you watch, it will not emit a token symbol with a NUL byte in it,
// and it will not hold still long enough for two tools to see the same thing.
// So the chain is generated here, deterministically, and every scenario drives
// it directly.
//
// Two properties make the results checkable:
//
//   Every block's contents are derived from its height *and* its epoch — how
//   many times that height has been rewritten. A reorg therefore replaces a
//   block with one carrying genuinely different transfers, so a row left behind
//   from an orphaned block is not merely suspicious, it is a value that exists
//   nowhere on the canonical chain.
//
//   Orphaned blocks stay retrievable by hash, the way a real node serves them
//   for a while after a reorg. An indexer unwinding its own history walks back
//   through hashes it recorded before the reorg, and a mock that answered "no
//   such block" would break tools that do the correct thing.

import { createHash } from "node:crypto";
import {
  METADATA_TOPIC,
  TRANSFER_TOPIC,
  encodeAddressWord,
  encodeStrings,
  encodeUint256,
} from "./abi.ts";

/** The one contract every reliability scenario indexes. */
export const CONTRACT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Values chosen to be hostile to a database rather than to a decoder: they are
 * all validly ABI-encoded, and an indexer that rejects them is rejecting data
 * the chain says is real.
 *
 * The NUL byte is the headline. PostgreSQL `text` cannot hold one — the wire
 * protocol terminates strings on it — so an indexer that passes a decoded
 * string straight through hits an error inside its own write path, at the point
 * where it is least able to do anything sensible about it. Nothing stops a
 * contract emitting one, and a few do.
 */
export const HOSTILE_SYMBOL = "NUL\u0000TOK";
export const HOSTILE_NAME =
  "Tok\u0000en \u{1f9ea} 'quoted' \\slash\\ \u00fcn\u00efcod\u00e9\ttab\nnewline";

/** uint256 max, which overflows anything narrower than numeric(78, 0). */
export const HOSTILE_VALUE = (1n << 256n) - 1n;

export interface MockLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  transactionHash: string;
  transactionIndex: number;
}

export interface MockTransaction {
  hash: string;
  from: string;
  to: string;
  index: number;
  input: string;
}

export interface MockBlock {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  /** How many times this height had been rewritten when this block was built. */
  epoch: number;
  transactions: MockTransaction[];
  logs: MockLog[];
  /**
   * Wall-clock milliseconds at which this block first became the chain head —
   * the moment an indexer could first have learned it existed. The head-latency
   * scenario measures against this and nothing else, because a synthetic
   * block's own timestamp field is a fiction the harness chose.
   */
  announcedAt: number;
}

export interface ChainOptions {
  /** Varies the whole chain; scenarios pass their own name so runs differ. */
  seed?: string;
  /** Unix seconds of block 0. */
  startTimestamp?: number;
  /** Seconds between consecutive block timestamps. */
  blockTimeSeconds?: number;
  /** Transfer events every block carries. */
  transfersPerBlock?: number;
  /**
   * Blocks below `head - finalityDepth` are reported under the `finalized` and
   * `safe` tags. Indexers use those tags to decide what they never have to
   * reconsider, so a scenario that reorgs deeper than this is testing what a
   * tool does when a promise it was given is broken — deliberately, and only in
   * the scenario that says so.
   */
  finalityDepth?: number;
}

const DEFAULTS = {
  seed: "open-indexer-benchmark",
  startTimestamp: 1_700_000_000,
  blockTimeSeconds: 12,
  transfersPerBlock: 2,
  finalityDepth: 64,
};

/** Deterministic byte source for a block's contents. */
function digest(...parts: (string | number)[]): Buffer {
  return createHash("sha256").update(parts.join("|")).digest();
}

const hexFrom = (source: Buffer, bytes: number, offset = 0): string =>
  `0x${source.subarray(offset, offset + bytes).toString("hex")}`;

/** An address as an indexed event topic: a whole 32-byte word, 0x-prefixed. */
const addressTopic = (address: string): string => `0x${encodeAddressWord(address)}`;

export interface ReorgRequest {
  /** How many blocks to drop from the tip. */
  depth: number;
  /**
   * How many blocks to build in their place. Defaults to `depth`, which keeps
   * the head at the same height; a smaller number makes the head move
   * backwards, which is rare on a real chain and mishandled often.
   */
  replaceWith?: number;
}

export interface ReorgOutcome {
  /** First height whose contents changed. */
  forkBlock: number;
  droppedHashes: string[];
  newHead: number;
}

export class MockChain {
  readonly options: Required<ChainOptions>;
  /** Canonical chain, indexed by height. */
  private canonical: MockBlock[] = [];
  /** Every block ever built, canonical or orphaned, keyed by hash. */
  private byHash = new Map<string, MockBlock>();
  /** Times each height has been rewritten, so a rebuild differs from the original. */
  private epochs = new Map<number, number>();
  /** Heights that additionally emit the hostile MetadataUpdated event. */
  private hostileHeights = new Set<number>();

  constructor(options: ChainOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.canonical.push(this.build(0, `0x${"00".repeat(32)}`));
    this.index(this.canonical[0]);
  }

  get head(): MockBlock {
    return this.canonical[this.canonical.length - 1];
  }

  get height(): number {
    return this.canonical.length - 1;
  }

  /** Highest block reported under the `finalized` and `safe` tags. */
  get finalizedHeight(): number {
    return Math.max(0, this.height - this.options.finalityDepth);
  }

  blockByNumber(number: number): MockBlock | undefined {
    return number >= 0 ? this.canonical[number] : undefined;
  }

  /** Orphans included, as a real node serves them after a reorg. */
  blockByHash(hash: string): MockBlock | undefined {
    return this.byHash.get(hash.toLowerCase());
  }

  isCanonical(block: MockBlock): boolean {
    return this.canonical[block.number]?.hash === block.hash;
  }

  /**
   * Mark a height as carrying the hostile metadata event. Must be set before
   * the height is built, which is how every scenario uses it: the chain is
   * configured, then extended.
   */
  emitHostileDataAt(height: number): void {
    this.hostileHeights.add(height);
  }

  /** Extend the canonical chain by `count` blocks and return them. */
  append(count = 1): MockBlock[] {
    const added: MockBlock[] = [];
    for (let i = 0; i < count; i++) {
      const block = this.build(this.height + 1, this.head.hash);
      this.canonical.push(block);
      this.index(block);
      added.push(block);
    }
    return added;
  }

  /** Extend until the head is at `height`; a no-op if it is already past it. */
  appendTo(height: number): MockBlock[] {
    return height > this.height ? this.append(height - this.height) : [];
  }

  /**
   * Replace the tip of the chain. The dropped blocks keep their hashes and stay
   * addressable, and every replacement block is built at a fresh epoch, so its
   * transfers differ from those of the block it displaced.
   */
  reorg({ depth, replaceWith }: ReorgRequest): ReorgOutcome {
    if (depth < 1) throw new Error(`reorg depth must be at least 1, got ${depth}`);
    if (depth > this.height) {
      throw new Error(
        `cannot reorg ${depth} blocks: the chain is only ${this.height} blocks past genesis`
      );
    }
    const forkBlock = this.height - depth + 1;
    const dropped = this.canonical.splice(forkBlock);
    for (const block of dropped) {
      this.epochs.set(block.number, (this.epochs.get(block.number) ?? 0) + 1);
    }

    for (let i = 0; i < (replaceWith ?? depth); i++) {
      const block = this.build(this.height + 1, this.head.hash);
      this.canonical.push(block);
      this.index(block);
    }

    return {
      forkBlock,
      droppedHashes: dropped.map((block) => block.hash),
      newHead: this.height,
    };
  }

  /**
   * Logs matching a filter, in chain order. `blockHash` selects a single block —
   * orphans included, since that is the form indexers use while unwinding.
   */
  getLogs(filter: {
    fromBlock?: number;
    toBlock?: number;
    blockHash?: string;
    address?: string[];
    /** Positional topic filters; null matches anything, an array is an OR. */
    topics?: (string | string[] | null)[];
  }): { log: MockLog; block: MockBlock }[] {
    const blocks: MockBlock[] = [];
    if (filter.blockHash) {
      const block = this.blockByHash(filter.blockHash);
      if (block) blocks.push(block);
    } else {
      const from = Math.max(0, filter.fromBlock ?? 0);
      const to = Math.min(this.height, filter.toBlock ?? this.height);
      for (let n = from; n <= to; n++) blocks.push(this.canonical[n]);
    }

    const addresses = filter.address?.map((a) => a.toLowerCase());
    const out: { log: MockLog; block: MockBlock }[] = [];
    for (const block of blocks) {
      for (const log of block.logs) {
        if (addresses && !addresses.includes(log.address)) continue;
        if (!topicsMatch(log.topics, filter.topics)) continue;
        out.push({ log, block });
      }
    }
    return out;
  }

  /** Every canonical log of the contract, in chain order. */
  canonicalLogs(): { log: MockLog; block: MockBlock }[] {
    return this.getLogs({ fromBlock: 0, toBlock: this.height });
  }

  // ── Block construction ───────────────────────────────────────────────

  private index(block: MockBlock): void {
    this.byHash.set(block.hash, block);
  }

  private build(number: number, parentHash: string): MockBlock {
    const epoch = this.epochs.get(number) ?? 0;
    const seed = digest(this.options.seed, number, epoch);
    const block: MockBlock = {
      number,
      // The epoch is inside the hash preimage, so a rebuilt height never
      // reproduces the hash of the block it replaced.
      hash: hexFrom(digest(this.options.seed, "block", number, epoch, parentHash), 32),
      parentHash,
      timestamp: this.options.startTimestamp + number * this.options.blockTimeSeconds,
      epoch,
      transactions: [],
      logs: [],
      announcedAt: Date.now(),
    };

    // Genesis carries no logs: indexers read it to identify the chain, and a
    // block that is also a data source makes "did it start from the right
    // place" harder to read in the results.
    if (number === 0) return block;

    const emit = (topics: string[], data: string) => {
      const index = block.logs.length;
      const transaction: MockTransaction = {
        hash: hexFrom(digest(this.options.seed, "tx", number, epoch, index), 32),
        from: hexFrom(seed, 20),
        to: CONTRACT,
        index,
        input: "0x",
      };
      block.transactions.push(transaction);
      block.logs.push({
        address: CONTRACT,
        topics,
        data,
        logIndex: index,
        transactionHash: transaction.hash,
        transactionIndex: index,
      });
    };

    for (let i = 0; i < this.options.transfersPerBlock; i++) {
      const source = digest(this.options.seed, "transfer", number, epoch, i);
      // A sha256 digest is 32 bytes, so the two addresses come from separate
      // digests rather than two 20-byte windows of the same one.
      const counterparty = digest(this.options.seed, "counterparty", number, epoch, i);
      emit(
        [
          TRANSFER_TOPIC,
          addressTopic(hexFrom(source, 20)),
          addressTopic(hexFrom(counterparty, 20)),
        ],
        // Bounded well below uint256 max so an ordinary block stays ordinary;
        // the extremes belong to the hostile block alone.
        `0x${encodeUint256(source.readBigUInt64BE(0) % 1_000_000_000n)}`
      );
    }

    if (this.hostileHeights.has(number)) {
      // A transfer from the zero address of every token that will ever exist,
      // followed by metadata a text column cannot hold.
      emit(
        [TRANSFER_TOPIC, addressTopic(ZERO_ADDRESS), addressTopic(hexFrom(seed, 20))],
        `0x${encodeUint256(HOSTILE_VALUE)}`
      );
      emit([METADATA_TOPIC], encodeStrings([HOSTILE_SYMBOL, HOSTILE_NAME]));
    }

    return block;
  }
}

/** Positional topic match, with null as a wildcard and an array as an OR. */
function topicsMatch(
  topics: string[],
  filter: (string | string[] | null)[] | undefined
): boolean {
  if (!filter || filter.length === 0) return true;
  for (const [position, want] of filter.entries()) {
    if (want === null || want === undefined) continue;
    const actual = topics[position];
    if (actual === undefined) return false;
    const options = (Array.isArray(want) ? want : [want]).map((t) => t.toLowerCase());
    if (options.length > 0 && !options.includes(actual.toLowerCase())) return false;
  }
  return true;
}
