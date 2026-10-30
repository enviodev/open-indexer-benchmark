import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CustomCaseConfig } from "../lib/case.ts";
import { canonicalRow, encodeAmount, encodeSeconds } from "../lib/checksum.ts";
import { fetchLogs, post, uintAtWord, type DecodedLog } from "../lib/hypersync.ts";

const POOL = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"; // USDC/WETH 0.05%

const SWAP_TOPIC =
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

const START_BLOCK = 21_000_000;

// 50,000 blocks is about a week: 26,932 swaps and 168 hourly snapshots.
const VERIFY_END_BLOCK = 21_049_999;

const HOUR = 3600;

/** The n-th word of a log's data payload, read as a two's-complement int. */
function intAtWord(data: string, index: number): bigint {
  const value = uintAtWord(data, index);
  return value >= BigInt(2) ** BigInt(255) ? value - BigInt(2) ** BigInt(256) : value;
}

/** Every block in `[fromBlock, toBlock]` (inclusive) with its timestamp. */
async function fetchBlockTimestamps(
  token: string,
  fromBlock: number,
  toBlock: number
): Promise<{ number: number; timestamp: number }[]> {
  const out: { number: number; timestamp: number }[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const json = await post("https://eth.hypersync.xyz/query", token, {
      from_block: cursor,
      to_block: toBlock + 1,
      include_all_blocks: true,
      field_selection: { block: ["number", "timestamp"] },
    });
    for (const batch of json.data ?? []) {
      for (const block of batch.blocks ?? []) {
        out.push({
          number: Number(block.number),
          timestamp: Number(BigInt(block.timestamp)),
        });
      }
    }
    const next = Number(json.next_block ?? 0);
    if (!next || next <= cursor) break;
    cursor = next;
  }
  if (out.length !== toBlock - fromBlock + 1) {
    throw new Error(
      `expected ${toBlock - fromBlock + 1} blocks from HyperSync, got ${out.length}`
    );
  }
  return out.sort((a, b) => a.number - b.number);
}

export const caseConfig: CustomCaseConfig = {
  name: "uniswap-hourly-snapshots",
  title: "Time-Based Snapshots",
  dir: dirname(fileURLToPath(import.meta.url)),
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,

  entities: [
    {
      key: "swap",
      label: "swaps",
      tableCandidates: ["Swap", "swap"],
      fields: [
        { role: "amount0", kind: "amount", candidates: ["amount0", "amount_0"] },
        { role: "amount1", kind: "amount", candidates: ["amount1", "amount_1"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
    {
      key: "hourlySnapshot",
      label: "hourly snapshots",
      tableCandidates: ["HourlySnapshot", "hourly_snapshot", "pool_hour"],
      keyFieldCount: 1,
      fields: [
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "hour"] },
        { role: "blockNumber", kind: "amount", candidates: ["blockNumber", "block_number"] },
        {
          role: "sqrtPriceX96",
          kind: "amount",
          candidates: ["sqrtPriceX96", "sqrt_price_x96", "sqrt_price"],
        },
        { role: "liquidity", kind: "amount", candidates: ["liquidity"] },
        { role: "tick", kind: "amount", candidates: ["tick"] },
      ],
    },
  ],

  // Mirrors the case logic in the README: the pool takes its state from the
  // latest swap, and each hour's snapshot is the pool as of the last block of
  // that hour — or of the range, for the hour the range ends in. Hours before
  // the first swap have no pool to snapshot.
  async buildGroundTruth(token, onProgress) {
    const logs = await fetchLogs({
      token,
      address: POOL,
      topics: [SWAP_TOPIC],
      fromBlock: START_BLOCK,
      toBlock: VERIFY_END_BLOCK,
      pass: "swaps",
      onProgress,
    });
    if (logs.length === 0) {
      throw new Error(`no swaps found on ${POOL} in the verification range`);
    }
    const blocks = await fetchBlockTimestamps(token, START_BLOCK, VERIFY_END_BLOCK);
    onProgress?.({ pass: "blocks", block: VERIFY_END_BLOCK, logs: blocks.length });

    const swapsByBlock = new Map<number, DecodedLog[]>();
    for (const log of logs) {
      swapsByBlock.set(log.blockNumber, [...(swapsByBlock.get(log.blockNumber) ?? []), log]);
    }

    const swapRows: string[] = [];
    const snapshots = new Map<number, string>();
    let pool: { sqrtPriceX96: bigint; liquidity: bigint; tick: bigint } | null = null;

    for (const block of blocks) {
      for (const log of swapsByBlock.get(block.number) ?? []) {
        // Swap(sender, recipient, int256 amount0, int256 amount1,
        //      uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        pool = {
          sqrtPriceX96: uintAtWord(log.data, 2),
          liquidity: uintAtWord(log.data, 3),
          tick: intAtWord(log.data, 4),
        };
        swapRows.push(
          canonicalRow([
            encodeAmount(intAtWord(log.data, 0)),
            encodeAmount(intAtWord(log.data, 1)),
            encodeSeconds(log.timestamp),
          ])
        );
      }
      if (!pool) continue;

      const hour = block.timestamp - (block.timestamp % HOUR);
      snapshots.set(
        hour,
        canonicalRow([
          encodeSeconds(hour),
          encodeAmount(BigInt(block.number)),
          encodeAmount(pool.sqrtPriceX96),
          encodeAmount(pool.liquidity),
          encodeAmount(pool.tick),
        ])
      );
    }

    return {
      totalEvents: swapRows.length,
      entities: { swap: swapRows, hourlySnapshot: [...snapshots.values()] },
      // The block handler has work in every block, not only those with a swap:
      // the last snapshot is not final until the range's last block is in.
      lastEventBlock: VERIFY_END_BLOCK,
    };
  },

  eventEntities: ["swap"],
};
