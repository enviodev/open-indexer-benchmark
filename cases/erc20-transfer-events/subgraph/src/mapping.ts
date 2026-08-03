import { Transfer } from "../generated/ERC20/ERC20";
import { TransferEvent } from "../generated/schema";

export function handleTransfer(event: Transfer): void {
  const entity = new TransferEvent(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.from = event.params.from.toHexString();
  entity.to = event.params.to.toHexString();
  entity.amount = event.params.value;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}
