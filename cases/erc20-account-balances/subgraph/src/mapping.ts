import { BigInt } from "@graphprotocol/graph-ts";
import { Approval, Transfer } from "../generated/ERC20/ERC20";
import {
  Account,
  Allowance,
  ApprovalEvent,
  TransferEvent,
} from "../generated/schema";

function loadOrCreateAccount(id: string): Account {
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.balance = BigInt.zero();
  }
  return account as Account;
}

export function handleTransfer(event: Transfer): void {
  const from = event.params.from.toHexString();
  const to = event.params.to.toHexString();

  // Both accounts come into existence as soon as they are seen, whether or not
  // the transfer moves anything: the case gives every address seen as sender or
  // recipient a row. Only the balances are conditional — sending to yourself
  // leaves it unchanged, and applying the debit and the credit would keep only
  // the credit, since both sides were loaded at the same pre-transfer balance.
  const sender = loadOrCreateAccount(from);
  const receiver = loadOrCreateAccount(to);
  if (from != to) {
    sender.balance = sender.balance.minus(event.params.value);
    receiver.balance = receiver.balance.plus(event.params.value);
  }
  sender.save();
  receiver.save();

  const transfer = new TransferEvent(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  transfer.from = from;
  transfer.to = to;
  transfer.amount = event.params.value;
  transfer.timestamp = event.block.timestamp.toI32();
  transfer.save();
}

export function handleApproval(event: Approval): void {
  const owner = event.params.owner.toHexString();
  const spender = event.params.spender.toHexString();

  const allowance = new Allowance(owner + "-" + spender);
  allowance.owner = owner;
  allowance.spender = spender;
  allowance.amount = event.params.value;
  allowance.save();

  const approval = new ApprovalEvent(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  approval.owner = owner;
  approval.spender = spender;
  approval.amount = event.params.value;
  approval.timestamp = event.block.timestamp.toI32();
  approval.save();
}
