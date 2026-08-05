import { ponder } from "ponder:registry";
import { tokenMetadata, transferEvent } from "ponder:schema";

// The row identity is (block, log index) rather than the tool's own event id,
// so the same row means the same thing in every tool's database and a reorg
// that rewrites a block is visible as a changed value rather than a changed key.
ponder.on("MockToken:Transfer", async ({ event, context }) => {
  await context.db.insert(transferEvent).values({
    id: `${event.block.number}-${event.log.logIndex}`,
    blockNumber: Number(event.block.number),
    logIndex: event.log.logIndex,
    from: event.args.from,
    to: event.args.to,
    value: event.args.value,
    timestamp: Number(event.block.timestamp),
  });
});

ponder.on("MockToken:MetadataUpdated", async ({ event, context }) => {
  // Deliberately unguarded: the hostile-values scenario emits a symbol
  // containing a NUL byte, and what this benchmark wants to know is what the
  // tool does with it, not what a defensive handler could have done instead.
  await context.db.insert(tokenMetadata).values({
    id: `${event.block.number}-${event.log.logIndex}`,
    blockNumber: Number(event.block.number),
    logIndex: event.log.logIndex,
    symbol: event.args.symbol,
    name: event.args.name,
  });
});
