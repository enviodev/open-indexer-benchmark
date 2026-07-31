import assert from "assert";
import { Safe, SafeSetup } from "../types";
import { createSafeDatasource } from "../types/datasources";
import type { ProxyCreationLog } from "../types/abi-interfaces/SafeProxyFactoryAbi";
import type { SafeSetupLog } from "../types/abi-interfaces/SafeAbi";

export async function handleProxyCreation(log: ProxyCreationLog): Promise<void> {
  assert(log.args, "No log.args");

  const proxy = log.args.proxy.toLowerCase();

  // Spin up a datasource for the proxy so its own events are indexed from here
  // on. The contract set is not known at build time and grows to six figures.
  await createSafeDatasource({ address: proxy });

  const safe = Safe.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    address: proxy,
    singleton: log.args.singleton.toLowerCase(),
    timestamp: Number(log.block.timestamp),
  });

  await safe.save();
}

// A proxy emits SafeSetup one log index *below* the ProxyCreation that
// announces it, so the datasource created above did not exist when this log
// was produced. Whether it is recorded anyway is what this case measures.
export async function handleSafeSetup(log: SafeSetupLog): Promise<void> {
  assert(log.args, "No log.args");

  const safeSetup = SafeSetup.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    initiator: log.args.initiator.toLowerCase(),
    threshold: log.args.threshold.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await safeSetup.save();
}
