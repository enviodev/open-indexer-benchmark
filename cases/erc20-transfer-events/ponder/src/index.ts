import { ponder } from "ponder:registry";
import {
  account,
  allowance,
  approvalEvent,
  transferEvent,
} from "ponder:schema";

ponder.on("RocketTokenRETH:Transfer", async ({ event, context }) => {
  const accountOps =
    event.args.from === event.args.to
      ? context.db
          .insert(account)
          .values({ address: event.args.from, balance: 0n })
          .onConflictDoNothing()
      : Promise.all([
          context.db
            .insert(account)
            .values({ address: event.args.from, balance: 0n })
            .onConflictDoUpdate((row) => ({
              balance: row.balance - event.args.value,
            })),
          context.db
            .insert(account)
            .values({
              address: event.args.to,
              balance: event.args.value,
            })
            .onConflictDoUpdate((row) => ({
              balance: row.balance + event.args.value,
            })),
        ]);

  await Promise.all([
    accountOps,
    context.db.insert(transferEvent).values({
      id: event.id,
      amount: event.args.value,
      timestamp: Number(event.block.timestamp),
      from: event.args.from,
      to: event.args.to,
    }),
  ]);
});

ponder.on("RocketTokenRETH:Approval", async ({ event, context }) => {
  await Promise.all([
    context.db
      .insert(allowance)
      .values({
        owner: event.args.owner,
        spender: event.args.spender,
        amount: event.args.value,
      })
      .onConflictDoUpdate({ amount: event.args.value }),
    context.db.insert(approvalEvent).values({
      id: event.id,
      amount: event.args.value,
      timestamp: Number(event.block.timestamp),
      owner: event.args.owner,
      spender: event.args.spender,
    }),
  ]);
});
