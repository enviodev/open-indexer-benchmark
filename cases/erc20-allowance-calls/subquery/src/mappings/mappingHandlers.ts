import assert from "assert";
import { ApprovalEvent, TokenAllowance } from "../types";
import type { ApprovalLog } from "../types/abi-interfaces/Erc20Abi";
import { Erc20Abi__factory } from "../types/contracts";

export async function handleApproval(log: ApprovalLog): Promise<void> {
  assert(log.args, "No log.args");

  const token = log.address.toLowerCase();
  const owner = log.args.owner.toLowerCase();
  const spender = log.args.spender.toLowerCase();
  const approved = log.args.value.toBigInt();

  // An approval of zero revokes it, and a revoked allowance is zero whatever
  // the token reports, so there is nothing to go and ask. Anything else is a
  // contract read through `api`, the provider SubQuery hands the mapping —
  // pinned to the block the approval was in, since the allowance is a value at
  // a point in the chain's history rather than at the head.
  let allowance = BigInt(0);
  if (approved !== BigInt(0)) {
    const contract = Erc20Abi__factory.connect(log.address, api);
    const result = await contract.allowance(log.args.owner, log.args.spender, {
      blockTag: log.blockNumber,
    });
    allowance = result.toBigInt();
  }

  const approvalEvent = ApprovalEvent.create({
    id: `${log.blockNumber}-${log.logIndex}`,
    token,
    owner,
    spender,
    approved,
    allowance,
    timestamp: Number(log.block.timestamp),
  });

  const current = TokenAllowance.create({
    id: `${token}-${owner}-${spender}`,
    token,
    owner,
    spender,
    allowance,
  });

  await Promise.all([approvalEvent.save(), current.save()]);
}
