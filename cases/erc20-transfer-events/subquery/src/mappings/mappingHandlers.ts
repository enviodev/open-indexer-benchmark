import assert from "assert";
import { TransferEvent } from "../types";
import type { TransferLog } from "../types/abi-interfaces/Erc20Abi";

export async function handleTransfer(log: TransferLog): Promise<void> {
  assert(log.args, "No log.args");

  const from = log.args.from.toLowerCase();
  const to = log.args.to.toLowerCase();
  const value = log.args.value.toBigInt();

  // Store the raw decoded Transfer event only — no balance aggregation.
  const transferEvent = TransferEvent.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    amount: value,
    timestamp: Number(log.block.timestamp),
    from: from,
    to: to,
  });

  await transferEvent.save();
}
