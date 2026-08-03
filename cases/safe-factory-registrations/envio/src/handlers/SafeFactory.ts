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

// The two events a registered proxy goes on emitting for the rest of its life,
// long after the registration that made it visible. What they cost is matching
// them against a contract set six figures deep.
indexer.onEvent(
  { contract: "Safe", event: "SafeReceived" },
  async ({ event, context }) => {
    context.SafeReceived.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      sender: event.params.sender,
      value: event.params.value,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "SafeModuleTransaction" },
  async ({ event, context }) => {
    context.SafeModuleTransaction.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      module: event.params.module,
      to: event.params.to,
      value: event.params.value,
      operation: Number(event.params.operation),
      timestamp: event.block.timestamp,
    });
  }
);
