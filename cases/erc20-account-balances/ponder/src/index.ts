import { ponder } from "ponder:registry";
import {
  account,
  allowance,
  approvalEvent,
  transferEvent,
} from "ponder:schema";

ponder.on("RocketTokenRETH:Transfer", async ({ event, context }) => {
  // Account upserts must be sequential (could be same address in self-transfer)
  await context.db
    .insert(account)
    .values({ id: event.args.from, balance: -event.args.value })
    .onConflictDoUpdate((row) => ({
      balance: row.balance - event.args.value,
    }));

  await context.db
    .insert(account)
    .values({
      id: event.args.to,
      balance: event.args.value,
    })
    .onConflictDoUpdate((row) => ({
      balance: row.balance + event.args.value,
    }));

  // Transfer event insert is independent — no await needed at the end of handler
  await context.db.insert(transferEvent).values({
    id: event.id,
    amount: event.args.value,
    timestamp: Number(event.block.timestamp),
    from: event.args.from,
    to: event.args.to,
  });
});

ponder.on("RocketTokenRETH:Approval", async ({ event, context }) => {
  await Promise.all([
    context.db
      .insert(allowance)
      .values({
        id: `${event.args.owner}-${event.args.spender}`,
        amount: event.args.value,
        owner: event.args.owner,
        spender: event.args.spender,
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
