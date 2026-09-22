import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  ERC20,
  MetadataUpdated as MetadataUpdatedEvent,
  Transfer as TransferEvent,
} from "../generated/ERC20/ERC20";
import { Account, MetadataUpdate, Token, Transfer } from "../generated/schema";

/**
 * A metadata string as it should be stored, or null.
 *
 * Empty returndata decodes to nothing and is a null, not a failure: that is
 * what a token with no `symbol()` gives you. A NUL in the middle is legal in a
 * Solidity string and unstorable in a text column, so it is stripped rather
 * than written through and left to fail the insert.
 *
 * Written as a loop over code units rather than a split on a NUL literal:
 * AssemblyScript is not TypeScript, and `charCodeAt` is the part of its string
 * surface least likely to surprise anyone reading this later.
 */
function clean(value: string): string | null {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) != 0) {
      out += value.charAt(i);
    }
  }
  return out.length == 0 ? null : out;
}

function loadOrCreateAccount(id: string): Account {
  let account = Account.load(id);
  if (account == null) {
    account = new Account(id);
    account.balance = BigInt.zero();
  }
  return account as Account;
}

/**
 * Written once, on the first transfer seen. Reading the metadata on every
 * transfer would be thousands of identical calls for one row.
 */
function ensureToken(address: Address): void {
  const id = address.toHexString();
  if (Token.load(id) != null) return;

  const token = new Token(id);
  const contract = ERC20.bind(address);

  // `try_` rather than a plain call: returndata that does not decode as a
  // string is the token not answering, which is a value this row carries -
  // not a reason to fail the block.
  const symbol = contract.try_symbol();
  token.symbol = symbol.reverted ? null : clean(symbol.value);

  const name = contract.try_name();
  token.name = name.reverted ? null : clean(name.value);

  token.save();
}

export function handleTransfer(event: TransferEvent): void {
  ensureToken(event.address);

  const from = event.params.from.toHexString();
  const to = event.params.to.toHexString();

  // Both accounts exist as soon as they are seen. Only the balances are
  // conditional: sending to yourself leaves it unchanged, and applying the
  // debit and the credit would keep only the credit, since both sides were
  // loaded at the same pre-transfer balance.
  const sender = loadOrCreateAccount(from);
  const receiver = loadOrCreateAccount(to);
  if (from != to) {
    sender.balance = sender.balance.minus(event.params.value);
    receiver.balance = receiver.balance.plus(event.params.value);
  }
  sender.save();
  receiver.save();

  const transfer = new Transfer(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  transfer.blockNumber = event.block.number;
  transfer.logIndex = event.logIndex;
  transfer.from = from;
  transfer.to = to;
  transfer.amount = event.params.value;
  transfer.save();
}

/** The other event the chain emits, stored as it arrives. */
export function handleMetadataUpdated(event: MetadataUpdatedEvent): void {
  const id =
    event.block.number.toString() + "-" + event.logIndex.toString();
  const row = new MetadataUpdate(id);
  row.blockNumber = event.block.number;
  row.logIndex = event.logIndex;
  row.symbol = clean(event.params.symbol);
  row.name = clean(event.params.name);
  row.save();
}
