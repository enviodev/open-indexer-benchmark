// Self-check for the reliability harness.
//
// The reliability results are only worth anything if the mock chain is right,
// so the parts of it that can be checked without an indexer are checked here:
// the hash, the encodings, the chain's behaviour under reorg, the endpoint's
// answers, the fault switch, and the row diffing every verdict is built on.
//
// Needs no credentials, no Docker and no network, which is why CI runs it on
// every pull request while the scenarios themselves run on a schedule.
//
//   node scripts/test-reliability.ts

import { keccakHex } from "../reliability/lib/keccak.ts";
import {
  METADATA_TOPIC,
  TRANSFER_TOPIC,
  encodeStrings,
  encodeUint256,
  logsBloom,
  selector,
} from "../reliability/lib/abi.ts";
import {
  CONTRACT,
  HOSTILE_SYMBOL,
  LARGE_LOG_INDEX,
  MockChain,
} from "../reliability/lib/chain.ts";
import { MockRpcServer } from "../reliability/lib/rpc-server.ts";
import { diffRows, expectedRows } from "../reliability/lib/entities.ts";
import { buildScenarioTable, buildSummaryTable } from "../reliability/lib/report.ts";
import { TOOL_INFO, outOfScope } from "../reliability/lib/drivers/index.ts";
import { TOOLS as BENCHMARK_TOOLS } from "../cases/lib/drivers/index.ts";
import { SCENARIOS } from "../reliability/lib/scenarios/index.ts";
import { lastErrorLine } from "../reliability/lib/harness.ts";
import type { ScenarioResult } from "../reliability/lib/harness.ts";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

/** JSON.stringify, but a BigInt renders rather than throwing. */
const show = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? `${item}n` : item
  );

const equal = (name: string, actual: unknown, expected: unknown) =>
  check(name, show(actual) === show(expected), `got ${show(actual)}, expected ${show(expected)}`);

// ── Keccak-256 ─────────────────────────────────────────────────────────
// Published vectors, plus the two signatures the mock chain depends on being
// hashed exactly as every indexer hashes them.
console.log("\nkeccak256");
equal(
  "empty string",
  keccakHex(""),
  "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
);
equal(
  '"abc"',
  keccakHex("abc"),
  "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
);
equal(
  "Transfer topic matches the one every ERC-20 indexer knows",
  TRANSFER_TOPIC,
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
);
equal("symbol() selector", selector("symbol()"), "0x95d89b41");
equal("balanceOf(address) selector", selector("balanceOf(address)"), "0x70a08231");

// ── ABI encoding ───────────────────────────────────────────────────────
console.log("\nABI encoding");
equal("uint256 word is 32 bytes", encodeUint256(1n).length, 64);
equal(
  "uint256 max",
  encodeUint256((1n << 256n) - 1n),
  "f".repeat(64)
);
{
  // Head-and-tail encoding of two strings: two offsets, then each length and
  // its padded bytes. Decoding it back is the check that matters, since that is
  // exactly what every indexer's decoder will do with it.
  const values = ["ab", HOSTILE_SYMBOL];
  const body = encodeStrings(values).slice(2);
  const wordAt = (index: number) => body.slice(index * 64, index * 64 + 64);
  equal("first offset is past both heads", BigInt(`0x${wordAt(0)}`), 64n);
  equal("second offset skips the first string", BigInt(`0x${wordAt(1)}`), 128n);
  equal("encoded length is a whole number of words", body.length % 64, 0);

  // Decoding it back is the check that matters: an indexer's decoder is what
  // will read this, and it will read it exactly this way.
  const decoded = values.map((_, index) => {
    const offset = Number(BigInt(`0x${wordAt(index)}`)) * 2;
    const length = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
    return Buffer.from(body.slice(offset + 64, offset + 64 + length * 2), "hex").toString(
      "utf8"
    );
  });
  equal("strings decode back to what was encoded", decoded, values);
}
{
  const bloom = logsBloom([CONTRACT, TRANSFER_TOPIC]);
  check("bloom is 256 bytes", bloom.length === 2 + 512, `length ${bloom.length}`);
  check("bloom has bits set", /[1-9a-f]/.test(bloom.slice(2)));
  equal("bloom is deterministic", logsBloom([CONTRACT, TRANSFER_TOPIC]), bloom);
  check(
    "different inputs give different blooms",
    logsBloom([CONTRACT]) !== logsBloom([TRANSFER_TOPIC])
  );
}

// ── Chain ──────────────────────────────────────────────────────────────
console.log("\nmock chain");
{
  const build = () => {
    const chain = new MockChain({ seed: "test" });
    chain.emitHostileDataAt(5);
    chain.append(20);
    return chain;
  };
  const a = build();
  const b = build();
  equal(
    "the same seed produces the same chain",
    a.blockByNumber(20)!.hash,
    b.blockByNumber(20)!.hash
  );
  equal(
    "a different seed produces a different chain",
    new MockChain({ seed: "other" }).blockByNumber(0)!.hash === a.blockByNumber(0)!.hash,
    false
  );

  let linked = true;
  for (let n = 1; n <= a.height; n++) {
    if (a.blockByNumber(n)!.parentHash !== a.blockByNumber(n - 1)!.hash) linked = false;
  }
  check("every block links to its parent", linked);

  equal("hostile block carries the metadata event",
    a.blockByNumber(5)!.logs.filter((log) => log.topics[0] === METADATA_TOPIC).length,
    1
  );
  equal(
    "ordinary blocks carry only transfers",
    a.blockByNumber(6)!.logs.every((log) => log.topics[0] === TRANSFER_TOPIC),
    true
  );
  check(
    "topics are 32-byte words",
    a.blockByNumber(6)!.logs.every((log) =>
      log.topics.every((topic) => topic.length === 66 && topic.startsWith("0x"))
    )
  );

  // ponder-sh/ponder#2373: a log index near the uint32 ceiling, which some
  // chains put on synthetic logs and which halted a backfill.
  {
    const big = new MockChain({ seed: "big" });
    big.emitLargeLogIndexAt(4);
    big.append(8);
    const indices = big.blockByNumber(4)!.logs.map((log) => log.logIndex);
    check("a large log index is emitted where asked", indices.includes(LARGE_LOG_INDEX));
    equal("it is 0xfffffffc, the value from the report", LARGE_LOG_INDEX, 0xfffffffc);
    check("it is inside JavaScript's safe integer range", LARGE_LOG_INDEX < Number.MAX_SAFE_INTEGER);
    check(
      "it does not fit an int4, which is the point",
      LARGE_LOG_INDEX > 2_147_483_647
    );
    check(
      "log indices in that block still ascend",
      indices.every((index, at) => at === 0 || index > indices[at - 1])
    );
    equal(
      "ordinary blocks are untouched",
      big.blockByNumber(5)!.logs.map((log) => log.logIndex),
      [0, 1]
    );
    check(
      "transaction indices stay positional, so receipts still line up",
      big.blockByNumber(4)!.logs.every((log, at) => log.transactionIndex === at)
    );
  }

  equal("finalized height trails the head", a.finalizedHeight, 0);
  const deep = new MockChain({ seed: "deep", finalityDepth: 5 });
  deep.append(20);
  equal("finalized height is head minus the finality depth", deep.finalizedHeight, 15);
}

console.log("\nreorgs");
{
  const chain = new MockChain({ seed: "reorg" });
  chain.append(30);
  const before = chain.blockByNumber(30)!.hash;
  const survives = chain.blockByNumber(25)!.hash;

  const outcome = chain.reorg({ depth: 3 });
  equal("fork block is the first replaced height", outcome.forkBlock, 28);
  equal("head stays at the same height", chain.height, 30);
  check("the tip is a different block", chain.blockByNumber(30)!.hash !== before);
  equal("blocks below the fork are untouched", chain.blockByNumber(25)!.hash, survives);
  check("orphans stay addressable by hash", chain.blockByHash(before) !== undefined);
  check(
    "orphans are no longer canonical",
    !chain.isCanonical(chain.blockByHash(before)!)
  );
  check(
    "replacement blocks carry different transfers",
    JSON.stringify(chain.blockByNumber(30)!.logs) !==
      JSON.stringify(chain.blockByHash(before)!.logs)
  );

  const shortened = chain.reorg({ depth: 6, replaceWith: 2 });
  equal("a shortening reorg moves the head backwards", chain.height, 26);
  equal("it reports the new head", shortened.newHead, 26);

  let stillLinked = true;
  for (let n = 1; n <= chain.height; n++) {
    if (chain.blockByNumber(n)!.parentHash !== chain.blockByNumber(n - 1)!.hash) {
      stillLinked = false;
    }
  }
  check("the chain is still linked after a reorg", stillLinked);
}

// ── Expected rows and diffing ──────────────────────────────────────────
console.log("\nexpected rows");
{
  const chain = new MockChain({ seed: "rows", transfersPerBlock: 2 });
  chain.emitHostileDataAt(3);
  chain.append(10);
  const rows = expectedRows(chain);
  // Ten blocks of two transfers, plus the hostile block's extra transfer.
  equal("one row per transfer log", rows.transferEvent.length, 21);
  equal("one metadata row", rows.tokenMetadata.length, 1);
  check(
    "the metadata row keeps the NUL byte",
    rows.tokenMetadata[0].includes(HOSTILE_SYMBOL)
  );

  const diff = diffRows(rows.transferEvent, rows.transferEvent);
  equal("identical row sets match", [diff.missing.length, diff.unexpected.length], [0, 0]);

  const short = diffRows(rows.transferEvent, rows.transferEvent.slice(1));
  equal("a dropped row is reported missing", short.missing.length, 1);

  const extra = diffRows(rows.transferEvent, [...rows.transferEvent, "stale|row"]);
  equal("an orphaned row is reported unexpected", extra.unexpected.length, 1);

  const twice = diffRows(rows.transferEvent, [
    ...rows.transferEvent,
    rows.transferEvent[0],
  ]);
  equal("a repeated row is reported duplicated", twice.duplicated.length, 1);
}

// ── Endpoint ───────────────────────────────────────────────────────────
console.log("\nRPC endpoint");
{
  const chain = new MockChain({ seed: "rpc", finalityDepth: 5 });
  chain.emitHostileDataAt(4);
  chain.append(20);
  const server = new MockRpcServer(chain, { maxLogRange: 10 });
  await server.listen(0);

  const call = async (method: string, params: unknown[] = []) => {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return (await response.json()) as { result?: unknown; error?: { code: number } };
  };

  equal("eth_chainId", (await call("eth_chainId")).result, "0x1");
  equal("eth_blockNumber tracks the head", (await call("eth_blockNumber")).result, "0x14");
  equal(
    "finalized trails by the finality depth",
    ((await call("eth_getBlockByNumber", ["finalized", false])).result as { number: string })
      .number,
    "0xf"
  );
  equal(
    "an unknown block is null, not an error",
    (await call("eth_getBlockByNumber", ["0x3e8", false])).result,
    null
  );

  const logs = (await call("eth_getLogs", [
    { fromBlock: "0x1", toBlock: "0x5", address: CONTRACT },
  ])).result as unknown[];
  equal("logs are filtered by range", logs.length, 12);

  const filtered = (await call("eth_getLogs", [
    { fromBlock: "0x1", toBlock: "0x5", topics: [METADATA_TOPIC] },
  ])).result as unknown[];
  equal("logs are filtered by topic", filtered.length, 1);

  equal(
    "a range past the head is empty rather than wrong",
    ((await call("eth_getLogs", [{ fromBlock: "0x64", toBlock: "0x65" }])).result as unknown[])
      .length,
    0
  );
  equal(
    "an oversized range is refused the way a provider refuses it",
    (await call("eth_getLogs", [{ fromBlock: "0x0", toBlock: "0x14" }])).error?.code,
    -32005
  );

  const batch = await fetch(server.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
      { jsonrpc: "2.0", id: 2, method: "eth_chainId", params: [] },
    ]),
  });
  const batched = (await batch.json()) as { id: number }[];
  equal("batched requests answer in order", batched.map((r) => r.id), [1, 2]);

  const orphanHash = chain.blockByNumber(20)!.hash;
  chain.reorg({ depth: 2 });
  check(
    "an orphaned block is still served by hash",
    (await call("eth_getBlockByHash", [orphanHash, false])).result !== null
  );

  // ── Faults ──
  server.faults.httpErrorRate = 1;
  const failed = await fetch(server.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  equal("the fault switch produces HTTP 500", failed.status, 500);
  server.heal();
  equal("healing restores the endpoint", (await call("eth_chainId")).result, "0x1");
  check("faults are counted", (server.stats.faults.http500 ?? 0) > 0);

  await server.close();
}

// ── Report rendering ───────────────────────────────────────────────────
console.log("\nreport");
{
  const result = (over: Partial<ScenarioResult>): ScenarioResult => ({
    scenario: SCENARIOS[0].key,
    tool: "ponder",
    toolName: "Ponder",
    toolUrl: "https://ponder.sh",
    status: "pass",
    detail: "",
    crashes: 0,
    restarts: 0,
    worstRecoveryMs: null,
    crashDetail: "",
    seconds: 1,
    ...over,
  });

  const table = buildSummaryTable(
    [result({}), result({ tool: "envio", toolName: "Envio Indexer", status: "fail", detail: "lost 3 rows" })],
    [SCENARIOS[0]]
  );
  check("a failing row carries a numbered note", table.includes("❌ (1)"));
  check("the note text is published", table.includes("lost 3 rows"));
  check("a passing row carries no note", table.includes("| ✅ |"));
  check(
    "tools this suite does not run are still listed",
    Object.keys(outOfScope()).every((tool) => table.includes(tool))
  );
  check(
    "no note contains an em-dash before its detail",
    table
      .split("\n")
      .filter((line) => line.startsWith("> **("))
      .every((line) => line.split("—").length === 2)
  );

  // A crashed tool's last words are arbitrary bytes, and they go straight into
  // a table cell. SubQuery's first published row carried a pipe, a newline and
  // a screenful of ANSI colour codes, and took the table apart.
  const hostile = buildScenarioTable(SCENARIOS[0], [
    result({
      status: "fail",
      detail: "died",
      crashDetail: "subquery-node-1  | \u001b[31mError:\u001b[39m a | b\nnext line",
    }),
  ]);
  // Cells are separated by unescaped pipes; an escaped one is content.
  const cellsOf = (line: string) => line.split(/(?<!\\)\|/);
  const rows = hostile.split("\n");
  const body = rows.filter((line) => line.startsWith("| ["));
  equal("a crash note stays on one row", body.length, 1);
  check("the pipe in a crash note is escaped", body[0].includes("\\|"));
  check("ANSI colour codes are stripped", !body[0].includes("\u001b"));
  equal(
    "every row has the same number of cells as the header",
    new Set(rows.map((line) => cellsOf(line).length)).size,
    1
  );
}

// ── Picking the line worth publishing ──────────────────────────────────
// A tool that stalls without exiting is only legible through what it logged,
// and a thrown error is several lines of which the last is often the least
// useful. This is Ponder's real output on the large log index.
console.log("\ntool error reporting");
{
  const ponder = [
    "12:47:33.015 WARN  Failed to fetch latest block chain=mainnet number=90",
    "RpcProviderError: Invalid RPC response: 'log.logIndex' (4294967292) is larger " +
      "than the maximum allowed value (2147483647).",
    "Please report this error to the RPC operator.",
  ];
  check(
    "the sentence naming the value wins over the one below it",
    lastErrorLine(ponder)?.includes("4294967292") === true,
    String(lastErrorLine(ponder))
  );
  equal(
    "a plain complaint is still found when nothing was thrown",
    lastErrorLine(["worker failed to start"]),
    "worker failed to start"
  );
  equal("quiet output yields nothing", lastErrorLine(["all fine"]), null);
}

// ── Coverage of the throughput benchmark ───────────────────────────────
// The benchmark gains tools faster than this suite does — four variants landed
// in one merge — and a tool that appears in neither the results nor the
// out-of-scope notes is simply absent, which reads as a tool nobody thought to
// measure rather than one nobody has got to yet.
console.log("\nbenchmark coverage");
{
  const benchmarkKeys = Object.keys(BENCHMARK_TOOLS).sort();
  const covered = Object.values(TOOL_INFO).flatMap((info) => info.covers);
  const accounted = [...new Set([...covered, ...Object.keys(outOfScope())])].sort();
  equal("every benchmark tool is either run here or explained", accounted, benchmarkKeys);

  const unknown = covered.filter((key) => !(key in BENCHMARK_TOOLS));
  equal("no reliability row claims a benchmark tool that does not exist", unknown, []);

  const twice = covered.filter((key, at) => covered.indexOf(key) !== at);
  equal("no benchmark tool is claimed by two reliability rows", twice, []);

  for (const [key, reason] of Object.entries(outOfScope())) {
    check(
      `the reason for ${key} carries no em-dash`,
      !reason.includes("\u2014"),
      reason
    );
  }
}

console.log(
  failures === 0
    ? "\nAll reliability harness checks passed.\n"
    : `\n${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
