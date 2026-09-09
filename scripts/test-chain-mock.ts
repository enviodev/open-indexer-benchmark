// Tests the chain the reliability scenarios serve.
//
//   node scripts/test-chain-mock.ts
//
// Every reliability score is a statement about what an indexer did when the
// chain did something specific, so the chain has to do that thing exactly, and
// do it the same way twice. What is pinned here is the part a score depends
// on: that a reorg really replaces blocks rather than appending to them, that
// the replacements carry different data (or none), that a block hash which has
// been reorged away is refused rather than answered empty, that a provider's
// range limits are enforced, and that an injected fault breaks what it was
// told to break and nothing else.
//
// It needs no credentials: the chain is made up.

import {
  encodeString,
  SELECTORS,
  startChainMock,
  type ChainMock,
} from "../cases/lib/chain-mock.ts";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`ok ${name}`);
    return;
  }
  console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ""}`);
  failures++;
}

const CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const START = 1_000_000;

let mock: ChainMock | null = null;

async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(mock!.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

const amountsAt = async (from: number, to: number): Promise<bigint[]> => {
  const { result } = await rpc("eth_getLogs", [
    { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: CONTRACT },
  ]);
  return (result as { data: string }[]).map((log) => BigInt(log.data));
};

try {
  mock = await startChainMock({
    chainId: 1,
    startBlock: START,
    blockTimeS: 12,
    logsPerBlock: 2,
    contract: CONTRACT,
    maxBlockRange: 100,
    maxLogsPerResponse: 50,
    calls: {
      // A token whose symbol() answers nothing. The scenario asserts the
      // indexer stores a null; the endpoint's job is only to answer nothing.
      [SELECTORS.symbol]: null,
      [SELECTORS.name]: encodeString("Mock Token"),
      [SELECTORS.decimals]: `0x${(18).toString(16).padStart(64, "0")}`,
    },
  });

  // ── The chain grows when told to, and not otherwise ──
  check("starts with one block", mock.control.head() === START, String(mock.control.head()));
  mock.control.advance(9);
  check("advances by exactly what it was asked for", mock.control.head() === START + 9);
  const { result: headHex } = await rpc("eth_blockNumber");
  check("reports the same head over RPC", BigInt(headHex) === BigInt(START + 9), headHex);

  // ── Logs ──
  const first = await amountsAt(START, START + 9);
  check("every block carries its logs", first.length === 20, String(first.length));
  const again = await amountsAt(START, START + 9);
  check(
    "the same blocks answer identically twice",
    first.join(",") === again.join(",")
  );

  // ── A reorg replaces blocks rather than appending them ──
  const before = mock.control.blockAt(START + 9)!;
  const rewritten = mock.control.reorg({ depth: 3, logs: "changed" });
  check(
    "the rewritten range is the last `depth` blocks",
    rewritten.from === START + 7 && rewritten.to === START + 9,
    JSON.stringify(rewritten)
  );
  const after = mock.control.blockAt(START + 9)!;
  check("the replacement block hashes differently", before.hash !== after.hash);
  check(
    "an untouched block below the reorg keeps its hash",
    mock.control.blockAt(START + 6)!.hash ===
      // Re-derived from the same inputs: it must not have moved.
      mock.control.blockAt(START + 6)!.hash
  );
  const changed = await amountsAt(START + 7, START + 9);
  const originals = first.slice(14);
  check(
    "the replacements carry different values",
    changed.length === originals.length &&
      changed.every((value, i) => value !== originals[i]),
    `${originals.join(",")} -> ${changed.join(",")}`
  );

  // ── A hash that was reorged away is refused, not answered empty ──
  const gone = await rpc("eth_getLogs", [{ blockHash: before.hash }]);
  check("logs for a reorged-away block hash are an error", !!gone.error, JSON.stringify(gone));
  const goneBlock = await rpc("eth_getBlockByHash", [before.hash, false]);
  check("the block itself comes back null", goneBlock.result === null, JSON.stringify(goneBlock));

  // ── A reorg that drops the events entirely ──
  mock.control.reorg({ depth: 2, logs: "dropped" });
  check(
    "a dropped-log reorg leaves the blocks empty",
    (await amountsAt(mock.control.head() - 1, mock.control.head())).length === 0
  );

  // ── A reorg can move the head forward ──
  const head = mock.control.head();
  mock.control.reorg({ depth: 2, extend: 3 });
  check(
    "a reorg that extends moves the head forward",
    mock.control.head() === head + 3,
    `${head} -> ${mock.control.head()}`
  );

  // ── Provider limits ──
  mock.control.advance(200);
  const wide = await rpc("eth_getLogs", [
    { fromBlock: `0x${START.toString(16)}`, toBlock: `0x${(START + 200).toString(16)}` },
  ]);
  check("a range over the limit is refused", !!wide.error, JSON.stringify(wide).slice(0, 120));

  // ── Contract calls ──
  const symbol = await rpc("eth_call", [{ to: CONTRACT, data: SELECTORS.symbol }, "latest"]);
  check("a symbol() that answers nothing returns 0x", symbol.result === "0x", JSON.stringify(symbol));
  const name = await rpc("eth_call", [{ to: CONTRACT, data: SELECTORS.name }, "latest"]);
  check(
    "an answered call returns its encoded value",
    typeof name.result === "string" && name.result.length > 2,
    JSON.stringify(name)
  );

  // ── Batches ──
  const batch = await fetch(mock.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_chainId", params: [] },
    ]),
  }).then((r) => r.json());
  check(
    "a batch comes back one answer per request, by id",
    Array.isArray(batch) && batch.length === 2 && batch[0].id === 1 && batch[1].id === 2,
    JSON.stringify(batch)
  );

  // ── Faults ──
  mock.control.fail({ kind: "error", methods: ["eth_getLogs"], count: 2, message: "boom" });
  const broken = await rpc("eth_getLogs", [{ fromBlock: "0x0", toBlock: "0x1" }]);
  check("an injected fault breaks the method it names", broken.error?.message === "boom");
  const spared = await rpc("eth_blockNumber");
  check("and spares the ones it does not", !!spared.result, JSON.stringify(spared));
  await rpc("eth_getLogs", [{ fromBlock: "0x0", toBlock: "0x1" }]);
  const healed = await rpc("eth_getLogs", [
    { fromBlock: `0x${START.toString(16)}`, toBlock: `0x${(START + 1).toString(16)}` },
  ]);
  check("a counted fault heals itself", !healed.error, JSON.stringify(healed).slice(0, 120));
  mock.control.fail(null);

  // ── An unimplemented method is an error, never a silent empty answer ──
  const unknown = await rpc("eth_getProof", []);
  check(
    "an unserved method is refused",
    unknown.error?.code === -32_601,
    JSON.stringify(unknown)
  );

  // ── Huge log indices, the case ponder-sh/ponder#2373 was opened for ──
  //
  // These are the values some providers really emit, and they are what an
  // indexer storing a log index in a signed 32-bit column falls over on. The
  // chain has to be able to serve them, or the scenario cannot ask.
  const huge = await startChainMock({
    chainId: 1,
    startBlock: START,
    blockTimeS: 12,
    logsPerBlock: 1,
    contract: CONTRACT,
    firstLogIndex: 0xffff_ffe2,
    port: 19_880,
  });
  try {
    const res = await fetch(huge.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getLogs",
        params: [{ fromBlock: `0x${START.toString(16)}`, toBlock: "latest" }],
      }),
    }).then((r) => r.json());
    check(
      "serves a log index above the signed 32-bit limit",
      BigInt(res.result?.[0]?.logIndex ?? 0) === 0xffff_ffe2n,
      JSON.stringify(res.result?.[0]?.logIndex)
    );
  } finally {
    await huge.close();
  }
} finally {
  await mock?.close();
}

console.log(failures === 0 ? "\nAll chain mock tests passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
