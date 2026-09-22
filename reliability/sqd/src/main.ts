import { TypeormDatabase } from "@subsquid/typeorm-store";
import { In } from "typeorm";
import { Account, Token, Transfer } from "./model";
import { CONTRACT_ADDRESS, processor, rpcClient } from "./processor";
import { events, functions } from "./abi/ERC20";

/** The byte Postgres will not accept in a text column. */
const NUL = String.fromCharCode(0);

/**
 * A metadata string as it should be stored, or null.
 *
 * Empty returndata is a null, not a failure: that is what a token with no
 * `symbol()` gives you. A NUL in the middle is legal in a Solidity string and
 * unstorable in a text column, so it is stripped rather than written through.
 */
function clean(value: string | null): string | null {
  if (value === null) return null;
  const stripped = value.split(NUL).join("");
  return stripped.length === 0 ? null : stripped;
}

type StringFunction = typeof functions.symbol | typeof functions.name;

async function readString(selector: StringFunction): Promise<string | null> {
  try {
    const data = await rpcClient.call("eth_call", [
      { to: CONTRACT_ADDRESS, data: selector.encode({}) },
      "latest",
    ]);
    return clean(selector.decodeResult(data));
  } catch {
    // A revert, or returndata that does not decode as a string, is the token
    // not answering - which is a null, not a failed batch.
    return null;
  }
}

/** Read once for the run rather than once per batch. */
let token: Promise<Token> | null = null;
function readToken(): Promise<Token> {
  token ??= (async () =>
    new Token({
      id: CONTRACT_ADDRESS,
      symbol: await readString(functions.symbol),
      name: await readString(functions.name),
    }))();
  return token;
}

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  /**
   * Transfers by id, rather than a list.
   *
   * A batch arrives whole, and a log identified by its block and index within
   * it can appear in one twice - a provider stitching two backends together
   * will serve it that way. Two rows with the same primary key in one
   * statement is something Postgres refuses outright, and counting the value
   * twice in a balance is worse than that, because it succeeds.
   */
  const transfers = new Map<string, Transfer>();
  /** Balance changes this batch makes, applied to stored balances at the end. */
  const deltas = new Map<string, bigint>();
  const move = (id: string, delta: bigint) =>
    deltas.set(id, (deltas.get(id) ?? 0n) + delta);

  for (const block of ctx.blocks) {
    for (const log of block.logs) {
      if (log.topics[0] !== events.Transfer.topic) continue;
      const id = `${block.header.height}-${log.logIndex}`;
      if (transfers.has(id)) continue;

      const { from, to, value } = events.Transfer.decode(log);
      transfers.set(
        id,
        new Transfer({
          id,
          blockNumber: BigInt(block.header.height),
          logIndex: BigInt(log.logIndex),
          from,
          to,
          amount: value,
        })
      );

      // Sending to yourself leaves the balance unchanged; the two moves cancel.
      move(from, -value);
      move(to, value);
    }
  }

  if (transfers.size === 0) return;

  // Balances are read, changed and written as a batch. Reading them one at a
  // time would be a round trip per transfer, and upserting the same account
  // twice in one statement is something Postgres refuses outright.
  const stored = await ctx.store.findBy(Account, { id: In([...deltas.keys()]) });
  const accounts = new Map(stored.map((account) => [account.id, account]));
  for (const [id, delta] of deltas) {
    const account = accounts.get(id) ?? new Account({ id, balance: 0n });
    account.balance += delta;
    accounts.set(id, account);
  }

  await ctx.store.upsert(await readToken());
  await ctx.store.upsert([...accounts.values()]);
  await ctx.store.insert([...transfers.values()]);
});
