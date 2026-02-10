import { BigInt, DataSourceContext } from "@graphprotocol/graph-ts"
import { PairCreated } from "../../generated/UniswapV2Factory/UniswapV2Factory"
import { Pair } from "../../generated/schema"
import { UniswapV2Pair } from "../../generated/templates"

export function handlePairCreated(event: PairCreated): void {
  let pair = new Pair(event.params.pair.toHexString())
  pair.token0 = event.params.token0.toHexString()
  pair.token1 = event.params.token1.toHexString()
  pair.createdAt = event.block.number
  pair.save()

  // Create the tracked contract based on the template with context
  UniswapV2Pair.create(event.params.pair)
} 