import assert from "assert";
import { Safe, SafeModuleTransaction, SafeReceived, SafeSetup } from "../types";
import { createSafeDatasource } from "../types/datasources";
import type { ProxyCreationLog } from "../types/abi-interfaces/SafeProxyFactoryAbi";
import type { ProxyCreationLog as ProxyCreationIndexedLog } from "../types/abi-interfaces/SafeProxyFactoryModernAbi";
import type {
  SafeModuleTransactionLog,
  SafeReceivedLog,
  SafeSetupLog,
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

// The two events a registered proxy goes on emitting for the rest of its life,
// long after the datasource that watches it was created.
export async function handleSafeReceived(log: SafeReceivedLog): Promise<void> {
  assert(log.args, "No log.args");

  const safeReceived = SafeReceived.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    sender: log.args.sender.toLowerCase(),
    value: log.args.value.toBigInt(),
    timestamp: Number(log.block.timestamp),
  });

  await safeReceived.save();
}

export async function handleSafeModuleTransaction(
  log: SafeModuleTransactionLog
): Promise<void> {
  assert(log.args, "No log.args");

  const moduleTransaction = SafeModuleTransaction.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    safe: log.address.toLowerCase(),
    module: log.args.module.toLowerCase(),
    to: log.args.to.toLowerCase(),
    value: log.args.value.toBigInt(),
    operation: log.args.operation,
    timestamp: Number(log.block.timestamp),
  });

  await moduleTransaction.save();
}
