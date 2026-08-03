import { ProxyCreation } from "../generated/SafeProxyFactory/SafeProxyFactory";
import { SafeSetup } from "../generated/templates/Safe/Safe";
import { Safe as SafeTemplate } from "../generated/templates";
import { Safe, SafeSetup as SafeSetupEntity } from "../generated/schema";

export function handleProxyCreation(event: ProxyCreation): void {
  // Spin up a data source for the proxy so its own events are indexed from
  // here on. The contract set is not known at build time and grows to six
  // figures during the run.
  SafeTemplate.create(event.params.proxy);

  const entity = new Safe(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  entity.address = event.params.proxy.toHexString();
  entity.singleton = event.params.singleton.toHexString();
  entity.timestamp = event.block.timestamp.toI32();
  entity.save();
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
