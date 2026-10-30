import { indexer } from "envio";

// The case indexes a single pool, so the block handler can find its state
// under a fixed id.
const POOL_ID = "pool";

indexer.onEvent(
  { contract: "UniswapV3Pool", event: "Swap", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    context.Pool.set({
      id: POOL_ID,
      sqrtPriceX96: event.params.sqrtPriceX96,
      liquidity: event.params.liquidity,
      tick: event.params.tick,
    });

    context.Swap.set({
      id: `${event.block.number}-${event.logIndex}`,
      amount0: event.params.amount0,
      amount1: event.params.amount1,
      timestamp: event.block.timestamp,
    });
  }
);

// Block handlers run after the block's events, so rewriting the hour's row on
// every block leaves it holding the pool as of the hour's last block. An hour
// without a swap still gets its row.
indexer.onBlock(
  { name: "HourlySnapshot", fields: { block: ["timestamp"] } },
  async ({ block, context }) => {
    const pool = await context.Pool.get(POOL_ID);
    if (!pool) return;

    const hour = block.timestamp - (block.timestamp % 3600);
    context.HourlySnapshot.set({
      ...pool,
      id: `${hour}`,
      timestamp: hour,
      blockNumber: block.number,
    });
  }
);
