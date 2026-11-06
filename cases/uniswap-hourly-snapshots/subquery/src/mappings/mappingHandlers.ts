import assert from "assert";
import type { EthereumBlock } from "@subql/types-ethereum";
import { HourlySnapshot, Pool, Swap } from "../types";
import type { SwapLog } from "../types/abi-interfaces/UniswapV3Pool";

// The case indexes a single pool, so the block handler can find its state
// under a fixed id.
const POOL_ID = "pool";

const HOUR = 3600;

async function writeSnapshot(
  blockNumber: number,
  timestamp: number,
  pool: Pool
): Promise<void> {
  const hour = timestamp - (timestamp % HOUR);
  await HourlySnapshot.create({
    id: `${hour}`,
    timestamp: hour,
    blockNumber,
    sqrtPriceX96: pool.sqrtPriceX96,
    tick: pool.tick,
  }).save();
}

// SubQuery runs a block's block handlers before its logs, so the snapshot the
// block handler writes holds the pool as of the end of the previous block.
// That is right for a block without a swap; for one with swaps, this handler
// rewrites the hour's row after each of them, so the block's last swap has the
// final word either way.
export async function handleSwap(log: SwapLog): Promise<void> {
  assert(log.args, "No log.args");

  const pool = Pool.create({
    id: POOL_ID,
    sqrtPriceX96: log.args.sqrtPriceX96.toBigInt(),
    tick: BigInt(log.args.tick),
  });
  const timestamp = Number(log.block.timestamp);

  await Promise.all([
    pool.save(),
    Swap.create({
      id: `${log.blockNumber}-${log.logIndex}`,
      amount0: log.args.amount0.toBigInt(),
      amount1: log.args.amount1.toBigInt(),
      timestamp,
    }).save(),
    writeSnapshot(log.blockNumber, timestamp, pool),
  ]);
}

// Rewriting the hour's row on every block leaves it holding the pool as of the
// hour's last block, and gives an hour without a swap its row too.
export async function handleBlock(block: EthereumBlock): Promise<void> {
  const pool = await Pool.get(POOL_ID);
  if (!pool) return;
  await writeSnapshot(block.number, Number(block.timestamp), pool);
}
