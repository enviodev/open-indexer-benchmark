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
  METADATA_EVERY,
  METADATA_TOPIC,
  SELECTORS,
  startChainMock,
  type ChainMock,
} from "../reliability/lib/chain-mock.ts";
import { TRANSFER_TOPIC } from "../cases/lib/hypersync.ts";

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

/** Whether a body is JSON at all, which a truncated one is not. */
function parses(body: string): boolean {
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(mock!.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

/**
 * The transfer amounts in a range.
 *
 * Filtered by topic, because the chain emits two events now and an unfiltered
 * getLogs answers with both - which is the point of the second one, and would
 * otherwise read here as a block carrying more transfers than it has.
 */
const amountsAt = async (from: number, to: number): Promise<bigint[]> => {
  const { result } = await rpc("eth_getLogs", [
    { fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, address: CONTRACT },
  ]);
  return (result as { data: string; topics: string[] }[])
    .filter((log) => log.topics[0] === TRANSFER_TOPIC)
    .map((log) => BigInt(log.data));
};

try {
  mock = await startChainMock({
    // Whatever port is free: these tests are worth running while a scenario
    // is running, and a scenario holds the default port.
    port: 0,
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

  // ── The parent of the start block is findable by hash ──
  //
  // Graph Node starts by reading the block before its start block and then
  // asking for it by hash. That parent is below the chain's start block, so it
  // is derived rather than stored, and answering null there reads to the tool
  // as a node that lost a block it had just named.
  const parent = await rpc("eth_getBlockByNumber", [
    `0x${(START - 1).toString(16)}`,
    false,
  ]);
  const parentHash = (parent.result as { hash: string } | null)?.hash;
  const byHash = await rpc("eth_getBlockByHash", [parentHash, false]);
  check(
    "an ancestor of the start block comes back by hash",
    (byHash.result as { number: string } | null)?.number === `0x${(START - 1).toString(16)}`,
    JSON.stringify(byHash).slice(0, 120)
  );
  const strayHash = await rpc("eth_getBlockByHash", [`0x${"ab".repeat(32)}`, false]);
  check(
    "a hash belonging to no block is still null",
    strayHash.result === null,
    JSON.stringify(strayHash).slice(0, 120)
  );

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
  // A body that stops halfway: a 200 a client cannot parse, which is the
  // failure a client that only checks the status code reads as an empty
  // result set.
  mock.control.fail({ kind: "truncated", methods: ["eth_getLogs"] });
  const cut = await fetch(mock.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [{ fromBlock: `0x${START.toString(16)}`, toBlock: `0x${(START + 2).toString(16)}` }],
    }),
  });
  const cutBody = await cut.text();
  check(
    "a truncated fault answers 200 with a body that does not parse",
    cut.status === 200 && cutBody.length > 0 && !parses(cutBody),
    `${cut.status}: ${cutBody.slice(0, 80)}`
  );
  mock.control.fail(null);

  // A block that exists, answered as though it does not - and only the block
  // lookups, because the rest of what that replica serves is fine.
  mock.control.fail({ kind: "missing", methods: ["eth_getBlockByNumber"] });
  const phantom = await rpc("eth_getBlockByNumber", [`0x${START.toString(16)}`, false]);
  check(
    "a missing fault answers null for a block that is there",
    phantom.result === null && !phantom.error,
    JSON.stringify(phantom).slice(0, 120)
  );
  mock.control.fail(null);
  const back = await rpc("eth_getBlockByNumber", [`0x${START.toString(16)}`, false]);
  check("and the block is there again once it heals", !!back.result);

  // A share of requests rather than all of them, and the same share twice
  // from the same seed: a partial fault nobody can reproduce is an anecdote.
  const sample = async (seed: number) => {
    mock!.control.fail({ kind: "error", methods: ["eth_blockNumber"], rate: 0.5, seed });
    let broke = 0;
    for (let i = 0; i < 40; i++) {
      const answer = await rpc("eth_blockNumber");
      if (answer.error) broke++;
    }
    mock!.control.fail(null);
    return broke;
  };
  const rolled = await sample(7);
  const rolledAgain = await sample(7);
  check(
    "a rated fault breaks some requests and spares others",
    rolled > 5 && rolled < 35,
    `${rolled} of 40`
  );
  check(
    "and the same seed breaks the same ones",
    rolled === rolledAgain,
    `${rolled} then ${rolledAgain}`
  );

  // ── A chain that gets shorter ──
  const tall = mock.control.head();
  const shorter = mock.control.reorg({ depth: 6, extend: -3 });
  check(
    "a reorg can leave the chain shorter than it was",
    mock.control.head() === tall - 3 && shorter.to === tall - 3,
    `${tall} -> ${mock.control.head()}`
  );
  check(
    "and the blocks above the new head are gone",
    mock.control.blockAt(tall) === null,
    JSON.stringify(mock.control.blockAt(tall))
  );
  mock.control.advance(3);

  // ── The second event ──
  //
  // A tool configured for both events that indexes only the transfers is
  // wrong in a way no amount of looking at transfers can see, so the chain
  // has to really emit the other one, at a topic the tools' own ABIs hash to.
  // A short span: the endpoint in this test caps a response at fifty logs,
  // which is a cap the suite tests elsewhere and not the subject here.
  const spanTo = mock.control.head();
  const spanFrom = Math.max(START, spanTo - 20);
  const { result: everything } = await rpc("eth_getLogs", [
    { fromBlock: `0x${spanFrom.toString(16)}`, toBlock: `0x${spanTo.toString(16)}` },
  ]);
  const metadataLogs = (everything as { topics: string[]; data: string }[]).filter(
    (log) => log.topics[0] === METADATA_TOPIC
  );
  const expected = mock.control
    .metadataRows(spanTo)
    .filter((row) => row.block >= spanFrom);
  check(
    "the chain emits a metadata event every so many blocks",
    metadataLogs.length === expected.length && expected.length > 0,
    `${metadataLogs.length} served, ${expected.length} in ground truth, every ${METADATA_EVERY}`
  );
  check(
    "its two strings decode to what ground truth says",
    metadataLogs.every((log, i) => {
      const data = log.data.slice(2);
      const at = (word: number) => Number(BigInt(`0x${data.slice(word * 64, word * 64 + 64)}`));
      const read = (offset: number) => {
        const start = (offset / 32) * 64;
        const length = Number(BigInt(`0x${data.slice(start, start + 64)}`));
        return Buffer.from(data.slice(start + 64, start + 64 + length * 2), "hex").toString("utf8");
      };
      return read(at(0)) === expected[i].symbol && read(at(1)) === expected[i].name;
    }),
    JSON.stringify(expected[0])
  );

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
    port: 0,
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
  // ── The WebSocket side: requests, subscriptions, and a feed gone quiet ──
  {
    const socket = new WebSocket(mock.wsUrl);
    const received: any[] = [];
    socket.addEventListener("message", (event) => received.push(JSON.parse(String(event.data))));
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("WebSocket did not open")));
    });
    const waitFor = async (holds: () => boolean) => {
      for (let i = 0; i < 100 && !holds(); i++) await new Promise((r) => setTimeout(r, 10));
      return holds();
    };
    const reply = (id: number) => received.find((m) => m.id === id);

    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }));
    await waitFor(() => reply(1) !== undefined);
    check(
      "a request over the WebSocket is answered like one over HTTP",
      reply(1)?.result === (await rpc("eth_blockNumber")).result,
      JSON.stringify(reply(1))
    );

    socket.send(
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_subscribe", params: ["newHeads"] })
    );
    await waitFor(() => reply(2) !== undefined);
    const subscription = reply(2)?.result;
    const heads = () => received.filter((m) => m.method === "eth_subscription");
    mock.control.advance(2);
    await waitFor(() => heads().length >= 2);
    check(
      "every new block is announced to a newHeads subscriber",
      heads().length === 2 &&
        heads().every((m) => m.params.subscription === subscription) &&
        Number(BigInt(heads()[1].params.result.number)) === mock.control.head(),
      JSON.stringify(heads().map((m) => m.params.result.number))
    );

    mock.control.reorg({ depth: 2, extend: 1 });
    await waitFor(() => heads().length >= 5);
    check(
      "a rewrite announces every block of the branch the chain switched to",
      heads().length === 5,
      `${heads().length} announcements`
    );

    mock.control.setSubscriptionsQuiet(true);
    mock.control.advance(3);
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "eth_blockNumber", params: [] }));
    await waitFor(() => reply(3) !== undefined);
    check(
      "a quiet feed announces nothing and still answers requests",
      heads().length === 5 && Number(BigInt(reply(3)?.result ?? "0x0")) === mock.control.head(),
      `${heads().length} announcements, ${JSON.stringify(reply(3))}`
    );
    mock.control.setSubscriptionsQuiet(false);
    check(
      "subscriptions are counted, and the count survives a reset",
      (mock.control.reset(), mock.control.stats().subscriptions === 1),
      String(mock.control.stats().subscriptions)
    );
    socket.close();
  }

  // ── A fault that answers some methods still answers errors as errors ──
  //
  // The missing-block fault passes everything but block lookups through to
  // the ordinary handler, and that handler throws for a method it does not
  // serve. Thrown from inside the fault, that took the process down.
  mock.control.fail({ kind: "missing" });
  const unserved = await rpc("eth_notAMethod").catch((err: Error) => ({ thrown: err.message }));
  mock.control.fail(null);
  check(
    "a method the chain does not serve is an error under the missing-block fault too",
    unserved?.error?.code === -32_601,
    JSON.stringify(unserved)
  );

  // ── An address that is not an address is refused at the door ──
  //
  // The chain served a 41-digit address for a while, because nothing between
  // the constant and the wire had an opinion about what an address is. It took
  // a real indexer refusing to start to notice.
  const badAddress = await startChainMock({
    chainId: 1,
    startBlock: START,
    blockTimeS: 12,
    logsPerBlock: 1,
    contract: `${CONTRACT}ff`,
    port: 0,
  }).then(
    (started) => started.close().then(() => null),
    (err: Error) => err
  );
  check(
    "a contract address of the wrong length is refused",
    badAddress !== null && /not a 20-byte address/.test(badAddress.message),
    String(badAddress)
  );
} finally {
  await mock?.close();
}

console.log(failures === 0 ? "\nAll chain mock tests passed." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
