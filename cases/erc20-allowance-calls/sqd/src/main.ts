import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import { ApprovalEvent, TokenAllowance } from "./model";
import { Contract, events } from "./abi/ERC20";

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  // One pass to decode, then every allowance read at once. A batch handler is
  // where a squid can overlap external calls: reading inside the decode loop
  // would serialise the batch behind one 200ms round trip per approval.
  const decoded = ctx.blocks.flatMap((block) =>
    block.logs.map((log) => {
      const { owner, spender, value } = events.Approval.decode(log);
      return {
        id: `${block.header.height}-${log.logIndex}`,
        token: log.address,
        owner,
        spender,
        approved: value,
        timestamp: Math.floor(block.header.timestamp / 1000),
        header: block.header,
      };
    })
  );

  const allowances = await Promise.all(
    decoded.map((entry) =>
      // An approval of zero revokes it, and a revoked allowance is zero
      // whatever the token reports — no call needed.
      entry.approved === 0n
        ? Promise.resolve(0n)
        : new Contract(ctx, entry.header, entry.token).allowance(
            entry.owner,
            entry.spender
          )
    )
  );

  const approvalEvents: ApprovalEvent[] = [];
  // Collapsed to one row per (token, owner, spender): the batch is in order, so
  // the last approval for a pair is the one that survives. Postgres also
  // rejects an upsert that touches the same row twice.
  const latest = new Map<string, TokenAllowance>();

  decoded.forEach((entry, i) => {
    const allowance = allowances[i];
    approvalEvents.push(
      new ApprovalEvent({
        id: entry.id,
        token: entry.token,
        owner: entry.owner,
        spender: entry.spender,
        approved: entry.approved,
        allowance,
        timestamp: entry.timestamp,
      })
    );
    const id = `${entry.token}-${entry.owner}-${entry.spender}`;
    latest.set(
      id,
      new TokenAllowance({
        id,
        token: entry.token,
        owner: entry.owner,
        spender: entry.spender,
        allowance,
      })
    );
  });

  await Promise.all([
    approvalEvents.length > 0 ? ctx.store.insert(approvalEvents) : Promise.resolve(),
    latest.size > 0 ? ctx.store.save([...latest.values()]) : Promise.resolve(),
  ]);
});
