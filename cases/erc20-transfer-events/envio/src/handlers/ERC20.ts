import { indexer } from "envio";

indexer.onEvent(
  { contract: "ERC20", event: "Transfer", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    context.TransferEvent.set({
      id: `${event.block.number}-${event.logIndex}`,
      amount: event.params.value,
      timestamp: event.block.timestamp,
      from: event.params.from,
      to: event.params.to,
    });
  }
);
