import assert from "assert";
import {
  Account,
  TransferEvent,
  Allowance,
  ApprovalEvent,
} from "../types";
import type {
  TransferLog,
  ApprovalLog,
} from "../types/abi-interfaces/Erc20Abi";

export async function handleTransfer(log: TransferLog): Promise<void> {
  assert(log.args, "No log.args");

  const from = log.args.from.toLowerCase();
  const to = log.args.to.toLowerCase();
  const value = log.args.value.toBigInt();

  // Upsert sender: subtract value from balance
  let sender = await Account.get(from);
  if (!sender) {
    sender = Account.create({ id: from, balance: BigInt(0) });
  }
  sender.balance = sender.balance - value;
  await sender.save();

  // Upsert receiver: add value to balance
  let receiver = await Account.get(to);
  if (!receiver) {
    receiver = Account.create({ id: to, balance: BigInt(0) });
  }
  receiver.balance = receiver.balance + value;
  await receiver.save();

  // Insert transfer event record
  const transferEvent = TransferEvent.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    amount: value,
    timestamp: Number(log.block.timestamp),
    from: from,
    to: to,
  });
  await transferEvent.save();
}

export async function handleApproval(log: ApprovalLog): Promise<void> {
  assert(log.args, "No log.args");

  const owner = log.args.owner.toLowerCase();
  const spender = log.args.spender.toLowerCase();
  const value = log.args.value.toBigInt();

  // Upsert allowance keyed by owner-spender
  const allowanceId = `${owner}-${spender}`;
  let allowance = await Allowance.get(allowanceId);
  if (!allowance) {
    allowance = Allowance.create({
      id: allowanceId,
      amount: value,
      owner: owner,
      spender: spender,
    });
  } else {
    allowance.amount = value;
  }
  await allowance.save();

  // Insert approval event record
  const approvalEvent = ApprovalEvent.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    amount: value,
    timestamp: Number(log.block.timestamp),
    owner: owner,
    spender: spender,
  });
  await approvalEvent.save();
}
