import assert from "assert";
import {
  Safe,
  SafeSetup,
  SafeReceived,
  SafeModuleTransaction,
  SafeMultiSigTransaction,
  ExecutionSuccess,
  ExecutionFailure,
  ChangedThreshold,
  ChangedMasterCopy,
  ChangedFallbackHandler,
  ChangedGuard,
  ChangedModuleGuard,
  EnabledModule,
  DisabledModule,
  AddedOwner,
  RemovedOwner,
} from "../types";
import { createSafeDatasource } from "../types/datasources";
import type { ProxyCreationLog } from "../types/abi-interfaces/SafeProxyFactoryAbi";
import type { ProxyCreationLog as ProxyCreationIndexedLog } from "../types/abi-interfaces/SafeProxyFactoryModernAbi";
import type {
  SafeSetupLog,
  SafeReceivedLog,
  SafeModuleTransactionLog,
  SafeMultiSigTransactionLog,
  ExecutionSuccessLog,
  ExecutionFailureLog,
  ChangedThresholdLog,
  ChangedMasterCopyLog,
  ChangedFallbackHandlerLog,
  ChangedGuardLog,
  ChangedModuleGuardLog,
  EnabledModuleLog,
  DisabledModuleLog,
  AddedOwnerLog,
  RemovedOwnerLog,
} from "../types/abi-interfaces/SafeAbi";

async function recordProxy(
  log: ProxyCreationLog | ProxyCreationIndexedLog
): Promise<void> {
  assert(log.args, "No log.args");

  const proxy = log.args.proxy.toLowerCase();

  // Spin up a datasource for the proxy so its own events are indexed from here
  // on. The contract set is not known at build time and grows throughout.
  await createSafeDatasource({ address: proxy });

  const safe = Safe.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    address: proxy,
    singleton: log.args.singleton.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await safe.save();
}

export async function handleProxyCreation(log: ProxyCreationLog): Promise<void> {
  await recordProxy(log);
}

// Safe 1.4.1 onwards: the same event with `proxy` indexed, decoded against the
// ABI its own datasource carries.
export async function handleProxyCreationIndexed(
  log: ProxyCreationIndexedLog
): Promise<void> {
  await recordProxy(log);
}

// The child handlers. Eight of these events made an argument `indexed` in Safe
// 1.4.x without changing the signature, and SubQuery resolves an event from its
// topic0 alone — two fragments sharing one would make every such log ambiguous
// and lose both layouts, so only the 1.4.x layout is declared and the older one
// goes undecoded.
export async function handleSafeSetup(log: SafeSetupLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = SafeSetup.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    initiator: log.args.initiator.toLowerCase(),
    threshold: log.args.threshold.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleSafeReceived(log: SafeReceivedLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = SafeReceived.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    sender: log.args.sender.toLowerCase(),
    value: log.args.value.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleSafeModuleTransaction(log: SafeModuleTransactionLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = SafeModuleTransaction.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    module: log.args.module.toLowerCase(),
    to: log.args.to.toLowerCase(),
    value: log.args.value.toBigInt(),
    operation: log.args.operation,
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleSafeMultiSigTransaction(log: SafeMultiSigTransactionLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = SafeMultiSigTransaction.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    to: log.args.to.toLowerCase(),
    value: log.args.value.toBigInt(),
    operation: log.args.operation,
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleExecutionSuccess(log: ExecutionSuccessLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = ExecutionSuccess.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    payment: log.args.payment.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleExecutionFailure(log: ExecutionFailureLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = ExecutionFailure.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    payment: log.args.payment.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleChangedThreshold(log: ChangedThresholdLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = ChangedThreshold.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    threshold: log.args.threshold.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleChangedMasterCopy(log: ChangedMasterCopyLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = ChangedMasterCopy.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    singleton: log.args.singleton.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleChangedFallbackHandler(log: ChangedFallbackHandlerLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = ChangedFallbackHandler.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    handler: log.args.handler.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleChangedGuard(log: ChangedGuardLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = ChangedGuard.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    guard: log.args.guard.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleChangedModuleGuard(log: ChangedModuleGuardLog): Promise<void> {
  assert(log.args, "No log.args");

  const entity = ChangedModuleGuard.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    moduleGuard: log.args.moduleGuard.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleEnabledModule(log: EnabledModuleLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = EnabledModule.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    module: log.args.module.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleDisabledModule(log: DisabledModuleLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = DisabledModule.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    module: log.args.module.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleAddedOwner(log: AddedOwnerLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = AddedOwner.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    owner: log.args.owner.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}

export async function handleRemovedOwner(log: RemovedOwnerLog): Promise<void> {
  // A log of the pre-1.4 layout reaches this handler too — same topic0 — and
  // SubQuery leaves `args` undefined when the ABI cannot decode it.
  if (!log.args) return;

  const entity = RemovedOwner.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    owner: log.args.owner.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await entity.save();
}
