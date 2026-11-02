import { ponder } from "ponder:registry";
import { hourlySnapshot, pool, swap } from "ponder:schema";

// The case indexes a single pool, so the block handler can find its state
// under a fixed id.
const POOL_ID = "pool";

ponder.on("UniswapV3Pool:Swap", async ({ event, context }) => {
  await context.db
    .insert(pool)
    .values({
      id: POOL_ID,
      sqrtPriceX96: event.args.sqrtPriceX96,
      tick: BigInt(event.args.tick),
    })
    .onConflictDoUpdate({
      sqrtPriceX96: event.args.sqrtPriceX96,
      tick: BigInt(event.args.tick),
    });

  await context.db.insert(swap).values({
    id: event.id,
    amount0: event.args.amount0,
    amount1: event.args.amount1,
    timestamp: Number(event.block.timestamp),
  });
});

// Block events sort after every log of their block, so rewriting the hour's
// row on every block leaves it holding the pool as of the hour's last block.
// An hour without a swap still gets its row.
ponder.on("HourlySnapshot:block", async ({ event, context }) => {
  const state = await context.db.find(pool, { id: POOL_ID });
  if (!state) return;

  const timestamp = Number(event.block.timestamp);
  const hour = timestamp - (timestamp % 3600);
  const values = {
    timestamp: hour,
    blockNumber: Number(event.block.number),
    sqrtPriceX96: state.sqrtPriceX96,
    tick: state.tick,
  };
  await context.db
    .insert(hourlySnapshot)
    .values({ id: `${hour}`, ...values })
    .onConflictDoUpdate(values);
});
