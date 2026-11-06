import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor, POOL_ADDRESS } from "./processor";
import { HourlySnapshot, Pool, Swap } from "./model";
import { events } from "./abi/UniswapV3Pool";

// The case indexes a single pool, so its state lives under a fixed id.
const POOL_ID = "pool";
const HOUR = 3600;

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  // Read back once per batch rather than cached in memory, so a resumed
  // processor and a rolled-back hot block both see the stored state.
  let pool = await ctx.store.get(Pool, POOL_ID);

  const swaps: Swap[] = [];
  const snapshots = new Map<string, HourlySnapshot>();
  let poolChanged = false;

  // Blocks arrive in order, and every block is present (includeAllBlocks), so
  // applying a block's swaps before writing its hour's row is the same as a
  // block handler that runs after the block's events.
  for (const block of ctx.blocks) {
    const timestamp = Math.floor(block.header.timestamp / 1000);

    for (const log of block.logs) {
      if (log.address !== POOL_ADDRESS || log.topics[0] !== events.Swap.topic) continue;
      const { amount0, amount1, sqrtPriceX96, tick } = events.Swap.decode(log);

      pool = new Pool({ id: POOL_ID, sqrtPriceX96, tick: BigInt(tick) });
      poolChanged = true;

      swaps.push(
        new Swap({
          id: `${block.header.height}-${log.logIndex}`,
          amount0,
          amount1,
          timestamp,
        })
      );
    }

    if (!pool) continue;

    // Overwritten by every block of the hour, so it ends holding the hour's
    // close. Rows from an earlier batch are replaced by the upsert below.
    const hour = timestamp - (timestamp % HOUR);
    snapshots.set(
      `${hour}`,
      new HourlySnapshot({
        id: `${hour}`,
        timestamp: hour,
        blockNumber: block.header.height,
        sqrtPriceX96: pool.sqrtPriceX96,
        tick: pool.tick,
      })
    );
  }

  await Promise.all([
    poolChanged && pool ? ctx.store.upsert(pool) : Promise.resolve(),
    swaps.length > 0 ? ctx.store.insert(swaps) : Promise.resolve(),
    snapshots.size > 0 ? ctx.store.upsert([...snapshots.values()]) : Promise.resolve(),
  ]);
});
