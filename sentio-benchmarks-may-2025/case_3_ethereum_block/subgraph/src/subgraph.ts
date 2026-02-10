import { Block } from "../generated/schema"
import { BigDecimal, BigInt, Address, ethereum } from "@graphprotocol/graph-ts"

export function handleBlock(block: ethereum.Block): void {
  // Create a unique ID for the block
  const blockId = block.hash.toHexString()
  
  // Create a new Block entity
  const blockEntity = new Block(blockId)
  
  // Set the block properties
  blockEntity.number = block.number
  blockEntity.hash = block.hash.toHexString()
  blockEntity.parentHash = block.parentHash.toHexString()
  blockEntity.timestamp = block.timestamp
  
  // Save the block entity
  blockEntity.save()
}