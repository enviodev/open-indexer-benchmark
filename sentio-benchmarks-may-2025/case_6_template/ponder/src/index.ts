import { ponder } from "ponder:registry";
import type { Context } from "ponder:registry";
import { Pair, Swap } from "../ponder.schema";

ponder.on("UniswapV2Factory:PairCreated", async ({ event, context }: { event: any; context: Context }) => {
  await context.db.insert(Pair).values({
    id: event.args[2].toLowerCase(),
    token0: event.args[0].toLowerCase(),
    token1: event.args[1].toLowerCase(),
    factory: event.log.address.toLowerCase(),
    createdAt: BigInt(event.block.number),
  });
});

ponder.on("UniswapV2Pair:Swap", async ({ event, context }: { event: any; context: Context }) => {
  const pairAddress = event.log.address.toLowerCase();

  await context.db.insert(Swap).values({
    id: event.transaction.hash+'-'+event.log.logIndex,
    pairId: pairAddress,
    sender: event.args.sender.toLowerCase(),
    to: event.args.to.toLowerCase(),
    amount0In: event.args.amount0In,
    amount1In: event.args.amount1In,
    amount0Out: event.args.amount0Out,
    amount1Out: event.args.amount1Out,
    timestamp: BigInt(event.block.timestamp),
    blockNumber: BigInt(event.block.number),
  });
});
