import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import { TransferEvent } from "./model";
import { events } from "./abi/ERC20";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  const transferEvents: TransferEvent[] = [];

  for (let block of ctx.blocks) {
    const timestamp = Math.floor(block.header.timestamp / 1000);

    for (let log of block.logs) {
      if (log.topics[0] === events.Transfer.topic) {
        const { from, to, value } = events.Transfer.decode(log);

        // Store the raw decoded Transfer event only — no balance aggregation.
        transferEvents.push(
          new TransferEvent({
            id: `${block.header.height}-${log.logIndex}`,
            amount: value,
            timestamp,
            from,
            to,
          })
        );
      }
    }
  }

  if (transferEvents.length > 0) {
    await ctx.store.insert(transferEvents);
  }
});
