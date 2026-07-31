// Tests result-table rendering and, more importantly, reading it back.
//
//   node scripts/test-tables.ts
//
// The parser is load-bearing: when a benchmark job fails, the published table
// is the only record of that tool's last result, and carry-forward re-reads it.
// If parsing silently breaks, a tool disappears from the results — which looks
// like "no longer benchmarked" rather than "the job failed". It has to survive
// markdown links, numbered failure notes, and two rows sharing a tool name.

import { buildTable, parsePublishedTable, rowKey } from "../cases/lib/table.ts";
import { toTableRow, type BenchmarkResult } from "../cases/lib/result.ts";

const HYPERSYNC = "https://docs.envio.dev/docs/HyperSync/overview";
const HYPERRPC = "https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc";

function result(over: Partial<BenchmarkResult> & { name: string }): BenchmarkResult {
  return {
    toolUrl: "https://example.test",
    source: "RPC",
    sourceUrl: HYPERRPC,
    storage: "Postgres",
    blocksPerSec: 1000,
    eventsPerSec: 100,
    throughputSource: "window",
    correctness: "ok",
    correctnessDetail: "",
    dbSizeBytes: 2_306_867,
    dbTotalBytes: 2_306_867,
    rangeSeconds: 1,
    windowSeconds: 60,
    ...over,
  };
}

const RESULTS: BenchmarkResult[] = [
  result({
    name: "Envio Indexer",
    toolUrl: "https://envio.dev",
    source: "HyperSync",
    sourceUrl: HYPERSYNC,
    eventsPerSec: 16_887,
    blocksPerSec: 123_194,
  }),
  result({
    name: "Rindexer",
    toolUrl: "https://rindexer.xyz",
    eventsPerSec: 214.9,
    blocksPerSec: 3_091.1,
    correctness: "mismatch",
    correctnessDetail: "464 of 1,747 account balances with the wrong value",
    dbSizeBytes: 5_347_737,
  }),
  // Same tool name as the first row, distinguished only by source.
  result({
    name: "Envio Indexer",
    toolUrl: "https://envio.dev",
    eventsPerSec: 70.9,
    blocksPerSec: 792.7,
  }),
  result({
    name: "Ponder",
    toolUrl: "https://ponder.sh",
    eventsPerSec: 0,
    blocksPerSec: 0,
    correctness: "unknown",
    correctnessDetail: "stopped after 12s having indexed 0 of 7,594 events",
    dbSizeBytes: null,
  }),
];

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
}

const rows = RESULTS.map(toTableRow);
const table = buildTable(rows);
const published = `<!-- BENCHMARK:demo:START -->\n${table}\n<!-- BENCHMARK:demo:END -->`;
const parsed = parsePublishedTable(published, "demo");

console.log(table);
console.log("\nChecks:");

check("every row round-trips", parsed.length === rows.length, `${parsed.length} of ${rows.length}`);

// Sorted by events/s, so the parsed order is the rendered order.
const sorted = [...rows].sort((a, b) => b.eventsPerSec - a.eventsPerSec);
check(
  "cells survive verbatim",
  parsed.every((row, i) => {
    const want = sorted[i];
    return (
      row.name === want.name &&
      row.eventsPerSec === want.eventsPerSec &&
      row.cells.events === want.cells.events &&
      row.cells.blocks === want.cells.blocks &&
      row.cells.source === want.cells.source &&
      row.cells.dbSize === want.cells.dbSize
    );
  })
);

check(
  "tool name is recovered from its markdown link",
  parsed.every((row) => !row.name.includes("[") && !row.name.includes("]")),
  parsed.map((r) => r.name).join(", ")
);

check(
  "rows sharing a tool name stay distinct",
  new Set(parsed.map(rowKey)).size === parsed.length,
  parsed.map(rowKey).join(" / ")
);

const rindexer = parsed.find((row) => row.name === "Rindexer")!;
check(
  "failure detail is recovered from its numbered note",
  rindexer.cells.correctnessDetail ===
    "464 of 1,747 account balances with the wrong value",
  JSON.stringify(rindexer.cells.correctnessDetail)
);
check("failure marker is recovered", rindexer.cells.correctness === "❌");

const ponder = parsed.find((row) => row.name === "Ponder")!;
check(
  "unknown status keeps its own note",
  ponder.cells.correctness === "❓" &&
    ponder.cells.correctnessDetail.startsWith("stopped after 12s"),
  `${ponder.cells.correctness} ${JSON.stringify(ponder.cells.correctnessDetail)}`
);

// Carrying a row forward must reproduce it exactly, note included.
const carried = buildTable([rows[0], { ...rindexer, carriedOver: true }]);
check(
  "a carried-forward row keeps its explanation",
  carried.includes("464 of 1,747 account balances with the wrong value") &&
    carried.includes("Rindexer") &&
    carried.includes("⚠️")
);
check(
  "re-rendering a carried row is stable",
  parsePublishedTable(
    `<!-- BENCHMARK:demo:START -->\n${carried}\n<!-- BENCHMARK:demo:END -->`,
    "demo"
  ).find((row) => row.name === "Rindexer")?.cells.correctnessDetail ===
    rindexer.cells.correctnessDetail
);

check("an empty table is handled", buildTable([]) === "_No results collected._");
check(
  "a missing case yields no rows",
  parsePublishedTable(published, "other-case").length === 0
);

console.log(failures === 0 ? "\nAll table checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
