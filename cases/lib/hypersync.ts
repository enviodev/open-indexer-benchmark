// Minimal HyperSync client used to build the ground-truth data that indexer
// output is verified against. Deliberately dependency-free: the benchmark has
// no root package.json and every script runs straight through `node`.

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

const HYPERSYNC_URL = "https://eth.hypersync.xyz/query";

export interface DecodedLog {
  blockNumber: number;
  logIndex: number;
  /** Unix seconds of the containing block. */
  timestamp: number;
  topic0: string;
  /** First indexed argument as a lowercase address (`from` / `owner`). */
  arg0: string;
  /** Second indexed argument as a lowercase address (`to` / `spender`). */
  arg1: string;
  /** The non-indexed `value` argument. */
  value: bigint;
}

/** `0x…32 bytes` topic → lowercase 20-byte address. */
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40).toLowerCase()}`;
}

/** First 32-byte word of a log's data payload as a bigint. */
function firstWord(data: string): bigint {
  const body = data.startsWith("0x") ? data.slice(2) : data;
  if (body.length < 64) return BigInt(0);
  return BigInt(`0x${body.slice(0, 64)}`);
}

/**
 * Fetch and decode every matching log in `[fromBlock, toBlock]` (both
 * inclusive). HyperSync paginates via `next_block`; its `to_block` is
 * exclusive, and block timestamps come back as hex strings.
 */
export async function fetchLogs(opts: {
  token: string;
  address: string;
  topics: string[];
  fromBlock: number;
  /** Inclusive. */
  toBlock: number;
  onProgress?: (block: number, logs: number) => void;
}): Promise<DecodedLog[]> {
  const { token, address, topics, fromBlock, toBlock } = opts;
  const out: DecodedLog[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const body = {
      from_block: cursor,
      to_block: toBlock + 1,
      logs: [{ address: [address.toLowerCase()], topics: [topics] }],
      field_selection: {
        log: ["block_number", "log_index", "topic0", "topic1", "topic2", "data"],
        block: ["number", "timestamp"],
      },
    };

    const res = await fetch(HYPERSYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `HyperSync HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`
      );
    }
    const json: any = await res.json();

    const timestamps = new Map<number, number>();
    for (const batch of json.data ?? []) {
      for (const block of batch.blocks ?? []) {
        timestamps.set(Number(block.number), Number(BigInt(block.timestamp)));
      }
    }

    for (const batch of json.data ?? []) {
      for (const log of batch.logs ?? []) {
        const blockNumber = Number(log.block_number);
        const timestamp = timestamps.get(blockNumber);
        if (timestamp === undefined) {
          throw new Error(`No block timestamp returned for block ${blockNumber}`);
        }
        out.push({
          blockNumber,
          logIndex: Number(log.log_index),
          timestamp,
          topic0: log.topic0.toLowerCase(),
          arg0: topicToAddress(log.topic1),
          arg1: topicToAddress(log.topic2),
          value: firstWord(log.data),
        });
      }
    }

    const next = Number(json.next_block ?? 0);
    if (!next || next <= cursor) {
      // HyperSync stops advancing once the requested range is exhausted.
      break;
    }
    cursor = next;
    opts.onProgress?.(Math.min(cursor - 1, toBlock), out.length);
  }

  // Logs arrive block-ordered per batch, but sort explicitly so any caller that
  // depends on ordering (event id construction) is not at the mercy of paging.
  out.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber - b.blockNumber
  );
  return out;
}

/** Current chain height as seen by HyperSync. */
export async function fetchChainHeight(token: string): Promise<number> {
  const res = await fetch("https://eth.hypersync.xyz/height", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HyperSync height HTTP ${res.status}`);
  const json: any = await res.json();
  return Number(json.height);
}
