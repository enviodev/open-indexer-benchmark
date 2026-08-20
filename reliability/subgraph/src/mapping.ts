import { MetadataUpdated, Transfer } from "../generated/MockToken/MockToken";
import { TokenMetadata, TransferEvent } from "../generated/schema";

// The row identity is (block, log index) rather than the tool's own event id,
// so the same row means the same thing in every tool's database.
export function handleTransfer(event: Transfer): void {
  const entity = new TransferEvent(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.blockNumber = event.block.number.toI32();
  entity.logIndex = event.logIndex;
  entity.from = event.params.from.toHexString();
  entity.to = event.params.to.toHexString();
  entity.value = event.params.value;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

// Deliberately unguarded: the hostile-values scenario emits a symbol containing
// a NUL byte, and the question is what the tool does with it, not what a
// defensive handler could have done instead.
export function handleMetadataUpdated(event: MetadataUpdated): void {
  const entity = new TokenMetadata(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.blockNumber = event.block.number.toI32();
  entity.logIndex = event.logIndex;
  entity.symbol = event.params.symbol;
  entity.name = event.params.name;
  entity.save();
}
