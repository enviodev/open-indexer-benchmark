// Records a stretch of a real chain at its head, for the scenarios that replay
// one through the mock chain.
//
//   node reliability/record.ts [rpc-url] [seconds]
//
// Defaults to a minute of Base through publicnode. Behind an HTTPS proxy, run
// it with NODE_USE_ENV_PROXY=1 so fetch goes through it.
//
// What it keeps is the chain, not a conversation with it: every block with its
// full transactions and every log those blocks hold, read once the blocks have
// settled. Each tool asks its own questions - ranges, single blocks by hash,
// receipts - and a recording of answers would only answer the questions asked
// while recording. The mock chain answers any question from the data instead.
//
// The token the projects index is picked from what the stretch holds: the
// ERC-20 contract whose Transfer events appear in the most blocks. The mock
// chain serves its logs under the projects' contract address, so the seven
// projects index real traffic without being pointed anywhere else.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const rpcUrl = process.argv[2] ?? "https://base-rpc.publicnode.com";
const seconds = Number(process.argv[3] ?? 60);
const out = join(dirname(fileURLToPath(import.meta.url)), "recordings", "base-head.json.gz");

type Json = Record<string, unknown>;

let nextId = 1;
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      });
      const body = (await response.json()) as { result?: T; error?: { message: string } };
      if (body.error) throw new Error(`${method}: ${body.error.message}`);
      if (body.result === undefined || body.result === null) throw new Error(`${method}: no result`);
      return body.result;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

const height = async () => Number.parseInt(await rpc<string>("eth_blockNumber", []), 16);
const hex = (n: number) => `0x${n.toString(16)}`;

/** Runs `work` over `items`, at most `limit` at a time, keeping the order. */
async function pooled<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    })
  );
  return results;
}

const from = (await height()) + 1;
console.log(`recording from block ${from} for ${seconds}s`);
await new Promise((resolve) => setTimeout(resolve, seconds * 1_000));
const to = await height();
// Read once the newest blocks have had time to settle, so the recording is the
// chain as it stayed rather than a branch seen for a moment at the head.
await new Promise((resolve) => setTimeout(resolve, 15_000));

const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
const blocks = await pooled(numbers, 8, (n) => rpc<Json>("eth_getBlockByNumber", [hex(n), true]));

// One block at a time, by its hash: public endpoints refuse an address-free
// range, and a read by hash can only answer for that exact block.
const logs = (
  await pooled(blocks, 8, (block) => rpc<Json[]>("eth_getLogs", [{ blockHash: block.hash }]))
).flat();

const logsByBlock = new Map<number, Json[]>();
for (const log of logs) {
  const n = Number.parseInt(log.blockNumber as string, 16);
  if (!logsByBlock.has(n)) logsByBlock.set(n, []);
  logsByBlock.get(n)!.push(log);
}

// The stretch has to be one chain: each block the child of the one before, and
// every log carrying the hash of the block it was read for.
for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  if (i > 0 && block.parentHash !== blocks[i - 1].hash) {
    throw new Error(`block ${numbers[i]} is not the child of block ${numbers[i - 1]}; record again`);
  }
  for (const log of logsByBlock.get(numbers[i]) ?? []) {
    if (log.blockHash !== block.hash) {
      throw new Error(`a log of block ${numbers[i]} carries another block's hash; record again`);
    }
  }
}

// ERC-20 Transfers only: an ERC-721 Transfer shares the topic but indexes its
// third argument, and the projects decode the amount from the data.
const blocksWithTransfers = new Map<string, Set<number>>();
for (const log of logs) {
  const topics = log.topics as string[];
  if (topics[0] !== TRANSFER_TOPIC || topics.length !== 3 || (log.data as string).length !== 66) continue;
  const address = (log.address as string).toLowerCase();
  if (!blocksWithTransfers.has(address)) blocksWithTransfers.set(address, new Set());
  blocksWithTransfers.get(address)!.add(Number.parseInt(log.blockNumber as string, 16));
}
const [token, tokenBlocks] = [...blocksWithTransfers].sort((a, b) => b[1].size - a[1].size)[0];

const timestamps = blocks.map((block) => Number.parseInt(block.timestamp as string, 16));
const blockTimeMs = Math.round(
  ((timestamps[timestamps.length - 1] - timestamps[0]) * 1_000) / (blocks.length - 1)
);

const recording = {
  source: new URL(rpcUrl).host,
  chainId: Number.parseInt(await rpc<string>("eth_chainId", []), 16),
  recordedAt: new Date().toISOString(),
  blockTimeMs,
  token,
  blocks: blocks.map((block, i) => ({ ...block, logs: logsByBlock.get(numbers[i]) ?? [] })),
};

mkdirSync(dirname(out), { recursive: true });
const raw = Buffer.from(JSON.stringify(recording));
const packed = gzipSync(raw, { level: 9 });
writeFileSync(out, packed);
console.log(
  `${blocks.length} blocks, ${logs.length} logs, block time ${blockTimeMs}ms; token ${token} ` +
    `transfers in ${tokenBlocks.size} of ${blocks.length} blocks; ` +
    `${(raw.length / 1e6).toFixed(1)}MB, ${(packed.length / 1e6).toFixed(1)}MB gzipped -> ${out}`
);
