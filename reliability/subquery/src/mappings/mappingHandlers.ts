import assert from "assert";
import { Account, Token, Transfer } from "../types";
import type { TransferLog } from "../types/abi-interfaces/Erc20Abi";
import { Erc20Abi__factory } from "../types/contracts";

/** The byte Postgres will not accept in a text column. */
const NUL = String.fromCharCode(0);

/**
 * A metadata string as it should be stored, or nothing.
 *
 * Empty returndata is a null, not a failure: that is what a token with no
 * `symbol()` gives you. A NUL in the middle is legal in a Solidity string and
 * unstorable in a text column, so it is stripped rather than written through.
 *
 * SubQuery's codegen types an optional field as `string | undefined`, and a
 * field left undefined is the null column this case is looking for.
 */
function clean(value: string): string | undefined {
  const stripped = value.split(NUL).join("");
  return stripped.length === 0 ? undefined : stripped;
}

/**
 * Written once, on the first transfer seen. Reading the metadata on every
 * transfer would be thousands of identical calls for one row.
 */
async function ensureToken(address: string): Promise<void> {
  const id = address.toLowerCase();
  if (await Token.get(id)) return;

  const contract = Erc20Abi__factory.connect(address, api);
  const read = async (call: () => Promise<string>): Promise<string | undefined> => {
    try {
      return clean(await call());
    } catch {
      // A revert, or returndata that does not decode as a string, is the token
      // not answering - which is a null, not a failed block.
      return undefined;
    }
  };

  await Token.create({
    id,
    symbol: await read(() => contract.symbol()),
    name: await read(() => contract.name()),
  }).save();
}

async function moveBalance(id: string, delta: bigint): Promise<void> {
  const account = (await Account.get(id)) ?? Account.create({ id, balance: BigInt(0) });
  account.balance += delta;
  await account.save();
}

export async function handleTransfer(log: TransferLog): Promise<void> {
  assert(log.args, "No log.args");

  await ensureToken(log.address);

  const from = log.args.from.toLowerCase();
  const to = log.args.to.toLowerCase();
  const value = log.args.value.toBigInt();

  // Sequential, not in parallel: a self-transfer is the same account twice,
  // and two reads issued together would both see the pre-transfer balance and
  // the second write would keep only the credit. In order, the debit and the
  // credit cancel, which is what a self-transfer should do.
  await moveBalance(from, -value);
  await moveBalance(to, value);

  await Transfer.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    blockNumber: BigInt(log.blockNumber),
    logIndex: BigInt(log.logIndex),
    from,
    to,
    amount: value,
  }).save();
}
