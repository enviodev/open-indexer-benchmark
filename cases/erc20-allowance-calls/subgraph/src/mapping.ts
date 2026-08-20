import { BigInt } from "@graphprotocol/graph-ts";
import { Approval, ERC20 } from "../generated/USDT/ERC20";
import { ApprovalEvent, TokenAllowance } from "../generated/schema";

export function handleApproval(event: Approval): void {
  const token = event.address.toHexString();
  const owner = event.params.owner.toHexString();
  const spender = event.params.spender.toHexString();

  // An approval of zero revokes it, and a revoked allowance is zero whatever
  // the token reports, so there is nothing to go and ask. Any other approval is
  // followed by a read of what the token now reports for the pair — served from
  // the call the manifest declared, which Graph Node fetched before the handler
  // was entered.
  let allowance = BigInt.zero();
  if (event.params.value.notEqual(BigInt.zero())) {
    allowance = ERC20.bind(event.address).allowance(
      event.params.owner,
      event.params.spender
    );
  }

  const approval = new ApprovalEvent(
    event.block.number.toString() + "-" + event.logIndex.toString()
  );
  approval.token = token;
  approval.owner = owner;
  approval.spender = spender;
  approval.approved = event.params.value;
  approval.allowance = allowance;
  approval.timestamp = event.block.timestamp.toI32();
  approval.save();

  const current = new TokenAllowance(token + "-" + owner + "-" + spender);
  current.token = token;
  current.owner = owner;
  current.spender = spender;
  current.allowance = allowance;
  current.save();
}
