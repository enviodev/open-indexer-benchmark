import assert from "assert";
import { TokenMetadata, TransferEvent } from "../types";
import type {
  MetadataUpdatedLog,
  TransferLog,
} from "../types/abi-interfaces/MockTokenAbi";

// The row identity is (block, log index) rather than the tool's own event id,
// so the same row means the same thing in every tool's database.
export async function handleTransfer(log: TransferLog): Promise<void> {
  assert(log.args, "No log.args");

  await TransferEvent.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    blockNumber: log.blockNumber,
    logIndex: BigInt(log.logIndex),
    from: log.args.from.toLowerCase(),
    to: log.args.to.toLowerCase(),
    value: log.args.value.toBigInt(),
    timestamp: Number(log.block.timestamp),
  }).save();
}

// Deliberately unguarded: the hostile-values scenario emits a symbol containing
// a NUL byte, and the question is what the tool does with it, not what a
// defensive handler could have done instead.
export async function handleMetadataUpdated(
  log: MetadataUpdatedLog
): Promise<void> {
  assert(log.args, "No log.args");

  await TokenMetadata.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    blockNumber: log.blockNumber,
    logIndex: BigInt(log.logIndex),
    symbol: log.args.symbol,
    name: log.args.name,
  }).save();
}
