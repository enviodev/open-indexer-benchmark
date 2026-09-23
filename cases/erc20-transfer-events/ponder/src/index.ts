import { ponder } from "ponder:registry";
import { transferEvent } from "ponder:schema";

ponder.on("USDC:Transfer", async ({ event, context }) => {
  // Store the raw decoded Transfer event only — no balance aggregation.
  await context.db.insert(transferEvent).values({
    id: event.id,
    amount: event.args.value,
    timestamp: Number(event.block.timestamp),
    from: event.args.from,
    to: event.args.to,
  });
});
