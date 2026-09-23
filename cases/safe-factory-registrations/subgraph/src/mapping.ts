import { Address, BigInt } from "@graphprotocol/graph-ts";
import { ProxyCreation } from "../generated/SafeProxyFactory/SafeProxyFactory";
import { ProxyCreation as ProxyCreationIndexed } from "../generated/SafeProxyFactory141/SafeProxyFactoryModern";
import {
  SafeSetup as SafeSetupEvent,
  SafeReceived as SafeReceivedEvent,
  SafeModuleTransaction as SafeModuleTransactionEvent,
  SafeMultiSigTransaction as SafeMultiSigTransactionEvent,
  ExecutionSuccess as ExecutionSuccessEvent,
  ExecutionSuccess1 as ExecutionSuccessV4Event,
  ExecutionFailure as ExecutionFailureEvent,
  ExecutionFailure1 as ExecutionFailureV4Event,
  ChangedThreshold as ChangedThresholdEvent,
  ChangedMasterCopy as ChangedMasterCopyEvent,
  ChangedFallbackHandler as ChangedFallbackHandlerEvent,
  ChangedFallbackHandler1 as ChangedFallbackHandlerV4Event,
  ChangedGuard as ChangedGuardEvent,
  ChangedGuard1 as ChangedGuardV4Event,
  ChangedModuleGuard as ChangedModuleGuardEvent,
  EnabledModule as EnabledModuleEvent,
  EnabledModule1 as EnabledModuleV4Event,
  DisabledModule as DisabledModuleEvent,
  DisabledModule1 as DisabledModuleV4Event,
  AddedOwner as AddedOwnerEvent,
  AddedOwner1 as AddedOwnerV4Event,
  RemovedOwner as RemovedOwnerEvent,
  RemovedOwner1 as RemovedOwnerV4Event,
} from "../generated/templates/Safe/Safe";
import { Safe as SafeTemplate } from "../generated/templates";
import {
  Safe,
  SafeSetup as SafeSetupEntity,
  SafeReceived as SafeReceivedEntity,
  SafeModuleTransaction as SafeModuleTransactionEntity,
  SafeMultiSigTransaction as SafeMultiSigTransactionEntity,
  ExecutionSuccess as ExecutionSuccessEntity,
  ExecutionFailure as ExecutionFailureEntity,
  ChangedThreshold as ChangedThresholdEntity,
  ChangedMasterCopy as ChangedMasterCopyEntity,
  ChangedFallbackHandler as ChangedFallbackHandlerEntity,
  ChangedGuard as ChangedGuardEntity,
  ChangedModuleGuard as ChangedModuleGuardEntity,
  EnabledModule as EnabledModuleEntity,
  DisabledModule as DisabledModuleEntity,
  AddedOwner as AddedOwnerEntity,
  RemovedOwner as RemovedOwnerEntity,
} from "../generated/schema";

function recordProxy(
  proxy: Address,
  singleton: Address,
  blockNumber: BigInt,
  logIndex: BigInt,
  timestamp: BigInt
): void {
  // Spin up a data source for the proxy so its own events are indexed from
  // here on. The contract set is not known at build time and grows throughout
  // the run.
  SafeTemplate.create(proxy);

  const entity = new Safe(blockNumber.toString() + "-" + logIndex.toString());
  entity.address = proxy.toHexString();
  entity.singleton = singleton.toHexString();
  entity.timestamp = timestamp.toI32();
  entity.save();
}

export function handleProxyCreation(event: ProxyCreation): void {
  recordProxy(
    event.params.proxy,
    event.params.singleton,
    event.block.number,
    event.logIndex,
    event.block.timestamp
  );
}

// Safe 1.4.1 onwards: the same event with `proxy` indexed. Graph Node decodes
// each data source against its own ABI, so the two handlers differ only in the
// generated type they take.
export function handleProxyCreationIndexed(event: ProxyCreationIndexed): void {
  recordProxy(
    event.params.proxy,
    event.params.singleton,
    event.block.number,
    event.logIndex,
    event.block.timestamp
  );
}

// The child handlers. A proxy emits SafeSetup one log index *below* the
// ProxyCreation that announces it, so the data source created above did not
// exist when that log was produced; whether it is recorded anyway is what this
// case measures. The `V4` pairs take the layout Safe 1.4.x introduced, where an
// argument moved into a topic without the signature changing — Graph Node runs
// whichever of the two can decode the log in front of it.
export function handleSafeSetup(event: SafeSetupEvent): void {
  const entity = new SafeSetupEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.initiator = event.params.initiator.toHexString();
  entity.threshold = event.params.threshold;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleSafeReceived(event: SafeReceivedEvent): void {
  const entity = new SafeReceivedEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.sender = event.params.sender.toHexString();
  entity.value = event.params.value;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleSafeModuleTransaction(event: SafeModuleTransactionEvent): void {
  const entity = new SafeModuleTransactionEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.module = event.params.module.toHexString();
  entity.to = event.params.to.toHexString();
  entity.value = event.params.value;
  entity.operation = event.params.operation;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleSafeMultiSigTransaction(event: SafeMultiSigTransactionEvent): void {
  const entity = new SafeMultiSigTransactionEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.to = event.params.to.toHexString();
  entity.value = event.params.value;
  entity.operation = event.params.operation;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleExecutionSuccess(event: ExecutionSuccessEvent): void {
  const entity = new ExecutionSuccessEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.payment = event.params.payment;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleExecutionSuccessV4(event: ExecutionSuccessV4Event): void {
  const entity = new ExecutionSuccessEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.payment = event.params.payment;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleExecutionFailure(event: ExecutionFailureEvent): void {
  const entity = new ExecutionFailureEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.payment = event.params.payment;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleExecutionFailureV4(event: ExecutionFailureV4Event): void {
  const entity = new ExecutionFailureEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.payment = event.params.payment;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedThreshold(event: ChangedThresholdEvent): void {
  const entity = new ChangedThresholdEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.threshold = event.params.threshold;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedMasterCopy(event: ChangedMasterCopyEvent): void {
  const entity = new ChangedMasterCopyEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.singleton = event.params.singleton.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedFallbackHandler(event: ChangedFallbackHandlerEvent): void {
  const entity = new ChangedFallbackHandlerEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.handler = event.params.handler.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedFallbackHandlerV4(event: ChangedFallbackHandlerV4Event): void {
  const entity = new ChangedFallbackHandlerEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.handler = event.params.handler.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedGuard(event: ChangedGuardEvent): void {
  const entity = new ChangedGuardEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.guard = event.params.guard.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedGuardV4(event: ChangedGuardV4Event): void {
  const entity = new ChangedGuardEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.guard = event.params.guard.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleChangedModuleGuard(event: ChangedModuleGuardEvent): void {
  const entity = new ChangedModuleGuardEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.moduleGuard = event.params.moduleGuard.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleEnabledModule(event: EnabledModuleEvent): void {
  const entity = new EnabledModuleEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.module = event.params.module.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleEnabledModuleV4(event: EnabledModuleV4Event): void {
  const entity = new EnabledModuleEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.module = event.params.module.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleDisabledModule(event: DisabledModuleEvent): void {
  const entity = new DisabledModuleEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.module = event.params.module.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleDisabledModuleV4(event: DisabledModuleV4Event): void {
  const entity = new DisabledModuleEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.module = event.params.module.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleAddedOwner(event: AddedOwnerEvent): void {
  const entity = new AddedOwnerEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.owner = event.params.owner.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleAddedOwnerV4(event: AddedOwnerV4Event): void {
  const entity = new AddedOwnerEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.owner = event.params.owner.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleRemovedOwner(event: RemovedOwnerEvent): void {
  const entity = new RemovedOwnerEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.owner = event.params.owner.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleRemovedOwnerV4(event: RemovedOwnerV4Event): void {
  const entity = new RemovedOwnerEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.owner = event.params.owner.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}
