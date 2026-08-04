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

// Everything a registered proxy emits. Eight of these events made an argument
// `indexed` in Safe 1.4.x without changing the signature, so one topic0 arrives
// in two incompatible layouts and each needs its own declaration — `name:` in
// config.yaml gives the second one a handler of its own.
//
// SafeSetup is the one that tests registration order: a proxy emits it one log
// index *below* the ProxyCreation that announces it, in the same transaction.
// Whether a tool records these is the capability this case measures.
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

indexer.onEvent(
  { contract: "Safe", event: "SafeMultiSigTransaction" },
  async ({ event, context }) => {
    context.SafeMultiSigTransaction.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      to: event.params.to,
      value: event.params.value,
      operation: Number(event.params.operation),
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ExecutionSuccess" },
  async ({ event, context }) => {
    context.ExecutionSuccess.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      payment: event.params.payment,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ExecutionSuccessV4" },
  async ({ event, context }) => {
    context.ExecutionSuccess.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      payment: event.params.payment,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ExecutionFailure" },
  async ({ event, context }) => {
    context.ExecutionFailure.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      payment: event.params.payment,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ExecutionFailureV4" },
  async ({ event, context }) => {
    context.ExecutionFailure.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      payment: event.params.payment,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedThreshold" },
  async ({ event, context }) => {
    context.ChangedThreshold.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      threshold: event.params.threshold,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedMasterCopy" },
  async ({ event, context }) => {
    context.ChangedMasterCopy.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      singleton: event.params.singleton,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedFallbackHandler" },
  async ({ event, context }) => {
    context.ChangedFallbackHandler.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      handler: event.params.handler,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedFallbackHandlerV4" },
  async ({ event, context }) => {
    context.ChangedFallbackHandler.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      handler: event.params.handler,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedGuard" },
  async ({ event, context }) => {
    context.ChangedGuard.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      guard: event.params.guard,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedGuardV4" },
  async ({ event, context }) => {
    context.ChangedGuard.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      guard: event.params.guard,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "ChangedModuleGuard" },
  async ({ event, context }) => {
    context.ChangedModuleGuard.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      moduleGuard: event.params.moduleGuard,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "EnabledModule" },
  async ({ event, context }) => {
    context.EnabledModule.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      module: event.params.module,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "EnabledModuleV4" },
  async ({ event, context }) => {
    context.EnabledModule.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      module: event.params.module,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "DisabledModule" },
  async ({ event, context }) => {
    context.DisabledModule.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      module: event.params.module,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "DisabledModuleV4" },
  async ({ event, context }) => {
    context.DisabledModule.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      module: event.params.module,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "AddedOwner" },
  async ({ event, context }) => {
    context.AddedOwner.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      owner: event.params.owner,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "AddedOwnerV4" },
  async ({ event, context }) => {
    context.AddedOwner.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      owner: event.params.owner,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "RemovedOwner" },
  async ({ event, context }) => {
    context.RemovedOwner.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      owner: event.params.owner,
      timestamp: event.block.timestamp,
    });
  }
);

indexer.onEvent(
  { contract: "Safe", event: "RemovedOwnerV4" },
  async ({ event, context }) => {
    context.RemovedOwner.set({
      id: `${event.block.number}-${event.logIndex}`,
      safe: event.srcAddress,
      owner: event.params.owner,
      timestamp: event.block.timestamp,
    });
  }
);
