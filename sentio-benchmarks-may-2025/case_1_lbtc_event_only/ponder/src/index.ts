import { ponder } from "ponder:registry";
import schema from "ponder:schema";

ponder.on("LBTC:Transfer", async ({ event, context }) => {
    const { from, to, value } = event.args;
    const timestamp = BigInt(event.block.timestamp) * 1000n;
    
    // Create transfer record
    await context.db.insert(schema.lbtcTransfer).values({
      id: event.id,
      from,
      to,
      value,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash
    });
  });