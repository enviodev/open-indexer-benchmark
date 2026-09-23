import { ponder } from "ponder:registry";
import { approvalEvent, tokenAllowance } from "ponder:schema";

ponder.on("ERC20:Approval", async ({ event, context }) => {
  const approved = event.args.value;

  // An approval of zero revokes it, and a revoked allowance is zero whatever
  // the token reports, so there is nothing to go and ask. Everything else is a
  // contract read: `context.client` is Ponder's own Viem client, which caches
  // results in the database and — because it profiles what each indexing
  // function asks for — issues the reads for upcoming events ahead of time
  // instead of one at a time as the events arrive.
  const allowance =
    approved === 0n
      ? 0n
      : await context.client.readContract({
          abi: context.contracts.ERC20.abi,
          // The event's own token, not a configured address: the case indexes
          // eight of them under one contract entry.
          address: event.log.address,
          functionName: "allowance",
          args: [event.args.owner, event.args.spender],
          // Defaults to the block the event is in, which is what the case
          // wants: the allowance as of the approval.
        });

  await Promise.all([
    context.db.insert(approvalEvent).values({
      id: event.id,
      token: event.log.address,
      owner: event.args.owner,
      spender: event.args.spender,
      approved,
      allowance,
      timestamp: Number(event.block.timestamp),
    }),
    context.db
      .insert(tokenAllowance)
      .values({
        id: `${event.log.address}-${event.args.owner}-${event.args.spender}`,
        token: event.log.address,
        owner: event.args.owner,
        spender: event.args.spender,
        allowance,
      })
      .onConflictDoUpdate({ allowance }),
  ]);
});
