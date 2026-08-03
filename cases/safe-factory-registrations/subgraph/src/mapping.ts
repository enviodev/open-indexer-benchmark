import { Address, BigInt } from "@graphprotocol/graph-ts";
import { ProxyCreation } from "../generated/SafeProxyFactory/SafeProxyFactory";
import { ProxyCreation as ProxyCreationIndexed } from "../generated/SafeProxyFactory141/SafeProxyFactoryModern";
import {
  SafeModuleTransaction,
  SafeReceived,
  SafeSetup,
} from "../generated/templates/Safe/Safe";
import { Safe as SafeTemplate } from "../generated/templates";
import {
  Safe,
  SafeModuleTransaction as SafeModuleTransactionEntity,
  SafeReceived as SafeReceivedEntity,
  SafeSetup as SafeSetupEntity,
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

// A proxy emits SafeSetup one log index *below* the ProxyCreation that
// announces it, so the data source created above did not exist when this log
// was produced. Whether it is recorded anyway is what this case measures.
export function handleSafeSetup(event: SafeSetup): void {
  const entity = new SafeSetupEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.initiator = event.params.initiator.toHexString();
  entity.threshold = event.params.threshold;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

// The two events a registered proxy goes on emitting for the rest of its life,
// long after the data source that watches it was created.
export function handleSafeReceived(event: SafeReceived): void {
  const entity = new SafeReceivedEntity(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.safe = event.address.toHexString();
  entity.sender = event.params.sender.toHexString();
  entity.value = event.params.value;
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
}

export function handleSafeModuleTransaction(event: SafeModuleTransaction): void {
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
