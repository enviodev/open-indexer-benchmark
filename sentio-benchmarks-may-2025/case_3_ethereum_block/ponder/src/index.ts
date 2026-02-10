import { ponder } from "ponder:registry";
import schema from "ponder:schema";

// Block indexing handler
ponder.on("EveryBlock:block", async ({ event, context }) => {
  const block = event.block;
  
  // Create block record
  await context.db.insert(schema.block).values({
    id: `1-${block.number}`, // Using 1 as the chainId for Ethereum mainnet
    number: BigInt(block.number),
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: BigInt(block.timestamp)
  });
});