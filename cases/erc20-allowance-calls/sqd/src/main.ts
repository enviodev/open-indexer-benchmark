import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor, rpcClient } from "./processor";
import { ApprovalEvent, TokenAllowance } from "./model";
import { events, functions } from "./abi/ERC20";

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
        height: block.header.height,
      };
    })
  );

  // An approval of zero revokes it, and a revoked allowance is zero whatever
  // the token reports — no call needed.
  const needCall = decoded.filter((entry) => entry.approved !== 0n);

  // The generated `Contract` binding sends one HTTP request per read, which for
  // a batch of thousands costs more in sockets than the round trips it is
  // waiting on. The client's own `batchCall` merges them into JSON-RPC batches
  // instead — the same calls, at the same blocks, carried by a couple of dozen
  // requests rather than thousands.
  const answers = needCall.length
    ? await rpcClient.batchCall(
        needCall.map((entry) => ({
          method: "eth_call",
          params: [
            { to: entry.token, data: functions.allowance.encode({ owner: entry.owner, spender: entry.spender }) },
            "0x" + entry.height.toString(16),
          ],
        }))
      )
    : [];

  const allowances = new Map<string, bigint>();
  needCall.forEach((entry, i) => {
    allowances.set(entry.id, functions.allowance.decodeResult(answers[i]));
  });

  const approvalEvents: ApprovalEvent[] = [];
  // Collapsed to one row per (token, owner, spender): the batch is in order, so
  // the last approval for a pair is the one that survives. Postgres also
  // rejects an upsert that touches the same row twice.
  const latest = new Map<string, TokenAllowance>();

  for (const entry of decoded) {
    const allowance = allowances.get(entry.id) ?? 0n;
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
  }

  await Promise.all([
    approvalEvents.length > 0 ? ctx.store.insert(approvalEvents) : Promise.resolve(),
    latest.size > 0 ? ctx.store.save([...latest.values()]) : Promise.resolve(),
  ]);
});
