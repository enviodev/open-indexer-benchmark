import { ponder } from "ponder:registry";
import {
  addedOwner,
  changedFallbackHandler,
  changedGuard,
  changedMasterCopy,
  changedModuleGuard,
  changedThreshold,
  disabledModule,
  enabledModule,
  executionFailure,
  executionSuccess,
  removedOwner,
  safe,
  safeModuleTransaction,
  safeMultiSigTransaction,
  safeReceived,
  safeSetup,
} from "ponder:schema";

// Both factory generations announce the same thing; only the layout behind
// `event.args` differs, and Ponder has already resolved that from each
// contract's ABI by the time the handler runs.
for (const factory of ["SafeProxyFactory", "SafeProxyFactoryModern"] as const) {
  ponder.on(`${factory}:ProxyCreation`, async ({ event, context }) => {
    await context.db.insert(safe).values({
      id: event.id,
      address: event.args.proxy,
      singleton: event.args.singleton,
      timestamp: Number(event.block.timestamp),
    });
  });
}

// The children of the two factory generations are separate declarations —
// a `factory()` reads one event layout — so every child handler is registered
// against both. The eight overloaded events are named by their full signature,
// which is how Ponder distinguishes two events sharing a topic0.
for (const child of ["Safe", "SafeModern"] as const) {
  ponder.on(`${child}:SafeSetup`, async ({ event, context }) => {
    await context.db.insert(safeSetup).values({
      id: event.id,
      safe: event.log.address,
      initiator: event.args.initiator,
      threshold: event.args.threshold,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:SafeReceived`, async ({ event, context }) => {
    await context.db.insert(safeReceived).values({
      id: event.id,
      safe: event.log.address,
      sender: event.args.sender,
      value: event.args.value,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:SafeModuleTransaction`, async ({ event, context }) => {
    await context.db.insert(safeModuleTransaction).values({
      id: event.id,
      safe: event.log.address,
      module: event.args.module,
      to: event.args.to,
      value: event.args.value,
      operationType: event.args.operation,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:SafeMultiSigTransaction`, async ({ event, context }) => {
    await context.db.insert(safeMultiSigTransaction).values({
      id: event.id,
      safe: event.log.address,
      to: event.args.to,
      value: event.args.value,
      operationType: event.args.operation,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ExecutionSuccess(bytes32 txHash, uint256 payment)`, async ({ event, context }) => {
    await context.db.insert(executionSuccess).values({
      id: event.id,
      safe: event.log.address,
      payment: event.args.payment,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ExecutionSuccess(bytes32 indexed txHash, uint256 payment)`, async ({ event, context }) => {
    await context.db.insert(executionSuccess).values({
      id: event.id,
      safe: event.log.address,
      payment: event.args.payment,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ExecutionFailure(bytes32 txHash, uint256 payment)`, async ({ event, context }) => {
    await context.db.insert(executionFailure).values({
      id: event.id,
      safe: event.log.address,
      payment: event.args.payment,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ExecutionFailure(bytes32 indexed txHash, uint256 payment)`, async ({ event, context }) => {
    await context.db.insert(executionFailure).values({
      id: event.id,
      safe: event.log.address,
      payment: event.args.payment,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedThreshold`, async ({ event, context }) => {
    await context.db.insert(changedThreshold).values({
      id: event.id,
      safe: event.log.address,
      threshold: event.args.threshold,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedMasterCopy`, async ({ event, context }) => {
    await context.db.insert(changedMasterCopy).values({
      id: event.id,
      safe: event.log.address,
      singleton: event.args.singleton,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedFallbackHandler(address handler)`, async ({ event, context }) => {
    await context.db.insert(changedFallbackHandler).values({
      id: event.id,
      safe: event.log.address,
      handler: event.args.handler,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedFallbackHandler(address indexed handler)`, async ({ event, context }) => {
    await context.db.insert(changedFallbackHandler).values({
      id: event.id,
      safe: event.log.address,
      handler: event.args.handler,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedGuard(address guard)`, async ({ event, context }) => {
    await context.db.insert(changedGuard).values({
      id: event.id,
      safe: event.log.address,
      guard: event.args.guard,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedGuard(address indexed guard)`, async ({ event, context }) => {
    await context.db.insert(changedGuard).values({
      id: event.id,
      safe: event.log.address,
      guard: event.args.guard,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:ChangedModuleGuard`, async ({ event, context }) => {
    await context.db.insert(changedModuleGuard).values({
      id: event.id,
      safe: event.log.address,
      moduleGuard: event.args.moduleGuard,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:EnabledModule(address module)`, async ({ event, context }) => {
    await context.db.insert(enabledModule).values({
      id: event.id,
      safe: event.log.address,
      module: event.args.module,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:EnabledModule(address indexed module)`, async ({ event, context }) => {
    await context.db.insert(enabledModule).values({
      id: event.id,
      safe: event.log.address,
      module: event.args.module,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:DisabledModule(address module)`, async ({ event, context }) => {
    await context.db.insert(disabledModule).values({
      id: event.id,
      safe: event.log.address,
      module: event.args.module,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:DisabledModule(address indexed module)`, async ({ event, context }) => {
    await context.db.insert(disabledModule).values({
      id: event.id,
      safe: event.log.address,
      module: event.args.module,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:AddedOwner(address owner)`, async ({ event, context }) => {
    await context.db.insert(addedOwner).values({
      id: event.id,
      safe: event.log.address,
      owner: event.args.owner,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:AddedOwner(address indexed owner)`, async ({ event, context }) => {
    await context.db.insert(addedOwner).values({
      id: event.id,
      safe: event.log.address,
      owner: event.args.owner,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:RemovedOwner(address owner)`, async ({ event, context }) => {
    await context.db.insert(removedOwner).values({
      id: event.id,
      safe: event.log.address,
      owner: event.args.owner,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${child}:RemovedOwner(address indexed owner)`, async ({ event, context }) => {
    await context.db.insert(removedOwner).values({
      id: event.id,
      safe: event.log.address,
      owner: event.args.owner,
      timestamp: Number(event.block.timestamp),
    });
  });

}
