import { BigInt, ethereum } from "@graphprotocol/graph-ts";
import { Swap as SwapEvent } from "../generated/UniswapV3Pool/UniswapV3Pool";
import { HourlySnapshot, Pool, Swap } from "../generated/schema";

// The case indexes a single pool, so the block handler can find its state
// under a fixed id.
const POOL_ID = "pool";

const HOUR = 3600;

export function handleSwap(event: SwapEvent): void {
  const pool = new Pool(POOL_ID);
  pool.sqrtPriceX96 = event.params.sqrtPriceX96;
  pool.tick = BigInt.fromI32(event.params.tick);
  pool.save();

  const swap = new Swap(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  swap.amount0 = event.params.amount0;
  swap.amount1 = event.params.amount1;
  swap.timestamp = event.block.timestamp.toI32();
  swap.save();
}

// Block handlers run after the block's event handlers, so rewriting the hour's
// row on every block leaves it holding the pool as of the hour's last block.
// An hour without a swap still gets its row.
export function handleBlock(block: ethereum.Block): void {
  const pool = Pool.load(POOL_ID);
  if (pool == null) return;

  const timestamp = block.timestamp.toI32();
  const hour = timestamp - (timestamp % HOUR);
  const snapshot = new HourlySnapshot(hour.toString());
  snapshot.timestamp = hour;
  snapshot.blockNumber = block.number.toI32();
  snapshot.sqrtPriceX96 = pool.sqrtPriceX96;
  snapshot.tick = pool.tick;
  snapshot.save();
}
