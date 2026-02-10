import { BigInt, dataSource } from "@graphprotocol/graph-ts"
import { Swap } from "../../generated/UniswapV2Pair/UniswapV2Pair"
import { UniswapV2Event } from "../../generated/schema"

export function handleSwap(event: Swap): void {
  // Get pair address and token information from dataSource
  let pairAddress = dataSource.address().toHexString()

  let swapEvent = new UniswapV2Event(event.transaction.hash.toHexString().concat('-').concat(event.logIndex.toString()))
  swapEvent.pair = pairAddress
  swapEvent.sender = event.params.sender.toHexString()
  swapEvent.to = event.params.to.toHexString()
  swapEvent.amount0In = event.params.amount0In
  swapEvent.amount0Out = event.params.amount0Out
  swapEvent.amount1In = event.params.amount1In
  swapEvent.amount1Out = event.params.amount1Out
  swapEvent.timestamp = event.block.timestamp
  swapEvent.blockNumber = event.block.number
  swapEvent.save()
} 