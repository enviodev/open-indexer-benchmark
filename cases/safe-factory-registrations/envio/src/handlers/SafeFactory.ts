import { indexer } from "envio";

// Register every proxy a factory announces, so its own events are indexed from
// then on. This is the whole point of the case: the contract set is not known
// at configuration time and grows throughout the run.
//
// The two canonical factory generations are separate contracts here because
// `proxy` became an indexed argument in 1.4.1 — same event signature, two
// incompatible payloads — but past decoding they say the same thing.
indexer.contractRegister(
  { contract: "SafeProxyFactory", event: "ProxyCreation" },
  async ({ event, context }) => {
    context.chain.Safe.add(event.params.proxy);
  }
);

indexer.contractRegister(
  { contract: "SafeProxyFactoryModern", event: "ProxyCreation" },
  async ({ event, context }) => {
    context.chain.Safe.add(event.params.proxy);
  }
);

indexer.onEvent(
  { contract: "SafeProxyFactory", event: "ProxyCreation" },
  async ({ event, context }) => {
    context.Safe.set({
      id: `${event.block.number}-${event.logIndex}`,
      address: event.params.proxy,
      singleton: event.params.singleton,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "SafeProxyFactoryModern", event: "ProxyCreation" },
  async ({ event, context }) => {
    context.Safe.set({
      id: `${event.block.number}-${event.logIndex}`,
      address: event.params.proxy,
      singleton: event.params.singleton,
      timestamp: event.block.timestamp,
    });
  }
);

// Emitted by the proxy during its own construction — one log index *below* the
// ProxyCreation that registers it, in the same transaction. Whether a tool
// records these is the capability this case measures.
indexer.onEvent(
  { contract: "Safe", event: "SafeSetup" },
  async ({ event, context }) => {
    context.SafeSetup.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      initiator: event.params.initiator,
      threshold: event.params.threshold,
      timestamp: event.block.timestamp,
    });
  }
);
