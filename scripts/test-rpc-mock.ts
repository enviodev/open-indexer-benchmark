// Tests the endpoint that serves a case's contract calls.
//
//   node scripts/test-rpc-mock.ts
//
// The endpoint is the External Contract Calls scenario's measuring instrument:
// every row in that table is a statement about how well an indexer kept it
// busy. So the things a row depends on are what is pinned here — that the
// latency is paid, that nothing is ever queued or rate limited however much
// arrives at once, that a batch comes back in the order it was asked for, and
// that a call the case does not define is refused rather than quietly
// answered.
//
// It needs no credentials: the upstream half is a local stub standing in for
// the real endpoint.

import { createServer } from "node:http";
import { caseConfig, allowanceOf } from "../cases/erc20-allowance-calls/case.config.ts";
import { startRpcMock } from "../cases/lib/rpc-mock.ts";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`ok ${name}`);
    return;
  }
  console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ""}`);
  failures++;
}

/** Stands in for the real RPC endpoint, and counts what reaches it. */
async function startUpstream() {
  let requests = 0;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      requests++;
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const answer = (entry: any) => ({
        jsonrpc: "2.0",
        id: entry.id,
        result: `upstream:${entry.method}`,
      });
      const body = Array.isArray(payload) ? payload.map(answer) : answer(payload);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

const TOKEN = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const OWNER = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const pad = (address: string) => address.slice(2).padStart(64, "0");
const allowanceData = (owner: string, spender: string) =>
  `0xdd62ed3e${pad(owner)}${pad(spender)}`;

const upstream = await startUpstream();
const mock = await startRpcMock(upstream.url, caseConfig.ethCall!);

async function rpc(body: unknown): Promise<any> {
  const res = await fetch(mock.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const call = (owner: string, spender: string, block: number, to = TOKEN) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "eth_call",
  params: [{ to, data: allowanceData(owner, spender) }, `0x${block.toString(16)}`],
});

try {
  // ── The answer is the one the ground truth expects ──
  const answered = await rpc(call(OWNER, SPENDER, 25_600_042));
  const expected = allowanceOf(TOKEN, OWNER, SPENDER, 25_600_042);
  check(
    "answers with the value the ground truth computes",
    BigInt(answered.result) === expected,
    `got ${answered.result}, expected 0x${expected.toString(16)}`
  );
  check(
    "answers a uint256-wide word",
    typeof answered.result === "string" && answered.result.length === 66,
    `got ${answered.result}`
  );

  // Same call, different block: a tool reading at the wrong block cannot match
  // the ground truth by accident.
  const otherBlock = await rpc(call(OWNER, SPENDER, 25_600_043));
  check(
    "the block is part of the answer",
    otherBlock.result !== answered.result
  );

  // ── Calls outside the case are refused ──
  const wrongToken = await rpc(
    call(OWNER, SPENDER, 25_600_042, "0x000000000000000000000000000000000000dead")
  );
  check("refuses a call to a contract outside the case", !!wrongToken.error);

  const wrongFunction = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: TOKEN, data: "0x70a08231" }, "0x1"],
  });
  check("refuses a function the case does not define", !!wrongFunction.error);

  const atHead = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: TOKEN, data: allowanceData(OWNER, SPENDER) }, "latest"],
  });
  check("refuses a call at the chain head", !!atHead.error);

  // ── Everything else reaches the real endpoint ──
  const before = upstream.requests();
  const relayed = await rpc({ jsonrpc: "2.0", id: 7, method: "eth_blockNumber", params: [] });
  check(
    "relays other methods upstream",
    relayed.result === "upstream:eth_blockNumber" && upstream.requests() === before + 1
  );

  // ── A mixed batch keeps its order ──
  const batch = await rpc([
    call(OWNER, SPENDER, 25_600_001),
    { jsonrpc: "2.0", id: 2, method: "eth_getBlockByNumber", params: [] },
    call(OWNER, SPENDER, 25_600_002),
  ]);
  check(
    "answers a mixed batch in order",
    Array.isArray(batch) &&
      batch.length === 3 &&
      BigInt(batch[0].result) === allowanceOf(TOKEN, OWNER, SPENDER, 25_600_001) &&
      batch[1].result === "upstream:eth_getBlockByNumber" &&
      BigInt(batch[2].result) === allowanceOf(TOKEN, OWNER, SPENDER, 25_600_002),
    JSON.stringify(batch)
  );

  // ── Latency, and that nothing else is imposed ──
  const { latencyMs } = caseConfig.ethCall!;

  mock.reset();
  const oneStart = performance.now();
  await rpc(call(OWNER, SPENDER, 25_600_010));
  const oneMs = performance.now() - oneStart;
  check(
    `holds a call for ${latencyMs}ms`,
    oneMs >= latencyMs && oneMs < latencyMs * 3,
    `took ${oneMs.toFixed(0)}ms`
  );

  // The endpoint neither queues nor rate limits, so a pile of calls arriving
  // together costs one round trip however big the pile is. This is the property
  // the whole scenario rests on: what limits an indexer has to be the indexer.
  const PILE = 50;
  mock.reset();
  const pileStart = performance.now();
  await Promise.all(
    Array.from({ length: PILE }, (_, i) => rpc(call(OWNER, SPENDER, 26_000_000 + i)))
  );
  const pileMs = performance.now() - pileStart;
  check(
    `serves ${PILE} at once in one round trip`,
    pileMs < latencyMs * 2,
    `took ${pileMs.toFixed(0)}ms`
  );
  check(
    "reports every one of them as in flight together",
    mock.stats().calls === PILE && mock.stats().peakInFlight === PILE,
    JSON.stringify(mock.stats())
  );

  // Ten times as many are still all in flight at once — there is no ceiling for
  // the rest to queue behind. Only concurrency is asserted here, not elapsed
  // time: past a few dozen it is the client's own socket setup that decides how
  // quickly the calls arrive, which is the same thing that will bound a real
  // indexer long before this endpoint does.
  const BIG = PILE * 10;
  mock.reset();
  await Promise.all(
    Array.from({ length: BIG }, (_, i) => rpc(call(OWNER, SPENDER, 27_000_000 + i)))
  );
  check(
    `takes ${BIG} at once without queueing any of them`,
    mock.stats().peakInFlight === BIG,
    JSON.stringify(mock.stats())
  );
} finally {
  await mock.close();
  await upstream.close();
}

console.log(failures === 0 ? "\nAll RPC endpoint tests passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
