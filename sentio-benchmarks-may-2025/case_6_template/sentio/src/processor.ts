import { EthChainId } from "@sentio/sdk/eth";
import { UniswapV2FactoryProcessor, PairCreatedEvent, UniswapV2FactoryContext } from "./types/eth/uniswapv2factory.js";
import { UniswapV2PairProcessorTemplate, SwapEvent, UniswapV2PairContext } from "./types/eth/uniswapv2pair.js";
import { UniswapV2Event, Pair } from "./schema/schema.js";

const factoryProcessor = UniswapV2FactoryProcessor.bind({
  address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  network: EthChainId.ETHEREUM,
  startBlock: 19000000,  // Recent block with good activity
  endBlock: 19010000,    // 1000 blocks should be enough for testing
}).onEventPairCreated(async (event: PairCreatedEvent, ctx: UniswapV2FactoryContext) => {
    // Store pair creation
    const pair = new Pair({
      id: event.args.pair,
      token0: event.args.token0,
      token1: event.args.token1,
      createdAt: BigInt(ctx.blockNumber)
    });
    await ctx.eventLogger.emit('Pair1', {pair});

    poolTemplate.bind({
      address: event.args.pair,
      startBlock: ctx.blockNumber
    }, ctx);
});

const poolTemplate = new UniswapV2PairProcessorTemplate()
  .onEventSwap(async (event: SwapEvent, ctx: UniswapV2PairContext) => {
    const swapEvent = new UniswapV2Event({
        id: `${ctx.transactionHash}-${event.index}`,
        pairID: ctx.address,
        sender: event.args.sender,
        to: event.args.to,
        amount0In: event.args.amount0In,        
        amount0Out: event.args.amount0Out,
        amount1In: event.args.amount1In,
        amount1Out: event.args.amount1Out,
        timestamp: BigInt(ctx.timestamp.getTime()),
        blockNumber: BigInt(ctx.blockNumber)    
    });

    await ctx.eventLogger.emit('Swap1', {swapEvent});
  }
);
