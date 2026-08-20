import { indexer } from "envio";

// The row identity is (block, log index) rather than the tool's own event id,
// so the same row means the same thing in every tool's database.
indexer.onEvent(
  { contract: "MockToken", event: "Transfer" },
  async ({ event, context }) => {
    context.TransferEvent.set({
      id: `${event.block.number}-${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: BigInt(event.logIndex),
      from: event.params.from,
      to: event.params.to,
      value: event.params.value,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "MockToken", event: "MetadataUpdated" },
  async ({ event, context }) => {
    // Deliberately unguarded: the hostile-values scenario emits a symbol
    // containing a NUL byte, and the question is what the tool does with it,
    // not what a defensive handler could have done instead.
    context.TokenMetadata.set({
      id: `${event.block.number}-${event.logIndex}`,
      blockNumber: event.block.number,
      logIndex: BigInt(event.logIndex),
      symbol: event.params.symbol,
      name: event.params.name,
    });
  }
);
