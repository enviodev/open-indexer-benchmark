import { ponder } from "ponder:registry";
import { account, token, transfer } from "ponder:schema";

/** The byte Postgres will not accept in a text column. */
const NUL = String.fromCharCode(0);

/**
 * Reads a string from the token, and treats "no answer" as a value.
 *
 * The token this suite indexes returns empty data for `symbol()`, which is
 * what a token that does not implement it does, and a name with a NUL byte in
 * it, which is legal in a Solidity string and not storable in a Postgres text
 * column. Both are values the row has to carry rather than reasons to stop:
 * the empty one as a null, and the NUL stripped out.
 */
async function readString(
  context: any,
  address: `0x${string}`,
  functionName: "symbol" | "name"
): Promise<string | null> {
  try {
    const value = await context.client.readContract({
      abi: context.contracts.ERC20.abi,
      address,
      functionName,
    });
    if (typeof value !== "string" || value.length === 0) return null;
    const cleaned = value.split(NUL).join("");
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    // A revert, or returndata that does not decode as a string, is the token
    // not answering — which is a null, not a failed block.
    return null;
  }
}

ponder.on("ERC20:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;

  // The token row is written once, on the first transfer seen. Reading it on
  // every transfer would be thousands of identical calls.
  const existing = await context.db.find(token, { id: event.log.address });
  if (!existing) {
    await context.db.insert(token).values({
      id: event.log.address,
      symbol: await readString(context, event.log.address, "symbol"),
      name: await readString(context, event.log.address, "name"),
    });
  }

  // Sequential, not in parallel: a self-transfer is the same account twice,
  // and two upserts issued together would both see the pre-transfer balance.
  // In order, the debit and the credit cancel, which is what a self-transfer
  // should do.
  await context.db
    .insert(account)
    .values({ id: from, balance: -value })
    .onConflictDoUpdate((row) => ({ balance: row.balance - value }));
  await context.db
    .insert(account)
    .values({ id: to, balance: value })
    .onConflictDoUpdate((row) => ({ balance: row.balance + value }));

  await context.db.insert(transfer).values({
    id: `${event.log.blockNumber}-${event.log.logIndex}`,
    blockNumber: event.log.blockNumber,
    logIndex: BigInt(event.log.logIndex),
    from,
    to,
    amount: value,
  });
});
