import { BigInt } from "@graphprotocol/graph-ts";
import {
  Transfer as TransferEvent,
  Approval as ApprovalEvent,
} from "../generated/ERC20/ERC20";
import {
  Account,
  TransferEvent as TransferEventEntity,
  Allowance,
  ApprovalEvent as ApprovalEventEntity,
} from "../generated/schema";

export function handleTransfer(event: TransferEvent): void {
  let fromAddress = event.params.from;
  let toAddress = event.params.to;
  let value = event.params.value;

  // Upsert sender account
  let sender = Account.load(fromAddress);
  if (sender == null) {
    sender = new Account(fromAddress);
    sender.balance = BigInt.zero();
  }
  sender.balance = sender.balance.minus(value);
  sender.save();

  // Upsert receiver account (handle self-transfers by re-loading)
  let receiver = Account.load(toAddress);
  if (receiver == null) {
    receiver = new Account(toAddress);
    receiver.balance = BigInt.zero();
  }
  receiver.balance = receiver.balance.plus(value);
  receiver.save();

  // Create immutable transfer event record (Bytes ID via concatI32)
  let transferEntity = new TransferEventEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  transferEntity.amount = value;
  transferEntity.timestamp = event.block.timestamp.toI32();
  transferEntity.from = fromAddress;
  transferEntity.to = toAddress;
  transferEntity.save();
}

export function handleApproval(event: ApprovalEvent): void {
  let ownerAddress = event.params.owner;
  let spenderAddress = event.params.spender;
  let value = event.params.value;

  // Upsert allowance keyed by owner+spender (Bytes concat)
  let allowanceId = ownerAddress.concat(spenderAddress);
  let allowance = Allowance.load(allowanceId);
  if (allowance == null) {
    allowance = new Allowance(allowanceId);
    allowance.owner = ownerAddress;
    allowance.spender = spenderAddress;
  }
  allowance.amount = value;
  allowance.save();

  // Create immutable approval event record (Bytes ID via concatI32)
  let approvalEntity = new ApprovalEventEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  );
  approvalEntity.amount = value;
  approvalEntity.timestamp = event.block.timestamp.toI32();
  approvalEntity.owner = ownerAddress;
  approvalEntity.spender = spenderAddress;
  approvalEntity.save();
}
