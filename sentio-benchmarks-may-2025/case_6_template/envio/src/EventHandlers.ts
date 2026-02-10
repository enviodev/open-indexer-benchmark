/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import { UniswapV2Factory, UniswapV2Pair } from "generated";
import type { Pair, Swap } from "generated";

// Register UniswapV2Pair contracts whenever they're created by the factory
UniswapV2Factory.PairCreated.contractRegister(({ event, context }) => {
  context.addUniswapV2Pair(event.params.pair);
});

// Handle PairCreated events to store pair information
UniswapV2Factory.PairCreated.handler(async ({ event, context }) => {
  // Create and save Pair entity
  const pair: Pair = {
    id: event.params.pair,
    token0: event.params.token0,
    token1: event.params.token1,
    createdAt: BigInt(event.block.number),
  };
  context.Pair.set(pair);
});

// Handle Swap events from all UniswapV2Pair contracts
UniswapV2Pair.Swap.handler(async ({ event, context }) => {
  // Create and save Swap event
  const swap: Swap = {
    id: `${event.block.hash}-${event.logIndex}`,
    pair: event.srcAddress,
    sender: event.params.sender,
    to: event.params.to,
    amount0In: event.params.amount0In,
    amount1In: event.params.amount1In,
    amount0Out: event.params.amount0Out,
    amount1Out: event.params.amount1Out,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  };
  context.Swap.set(swap);
});
