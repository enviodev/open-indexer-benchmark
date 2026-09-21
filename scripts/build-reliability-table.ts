// Collects the reliability suite's output into the table the README publishes.
//
//   RESULTS_DIR=results node scripts/build-reliability-table.ts
//   UPDATE_README=1 RESULTS_DIR=results node scripts/build-reliability-table.ts
//
// The table is always written to OUT_DIR, which is what the pull request
// comment is assembled from. README.md is only rewritten when UPDATE_README
// says so: a pull request publishes its results as a comment, and only a run
// on main changes what the repository claims.
//
// The same shape as scripts/build-tables.ts, and for the same reasons: read
// the result lines each job emitted, render them with the module the runner
// renders with, and keep the last published row for any tool that produced
// nothing this time — a tool that silently vanishes from a table reads as one
// nobody measures rather than one whose job failed.
//
// What differs is which rows exist at all. The table covers every tool the
// suite intends to measure — every tool reading plain RPC — whether or not it
// has been measured yet, because a row missing from a table reads as a tool
// nobody thought of rather than one whose project is not written. A tool that
// reads a source the benchmark cannot make reorg on demand is a different
// statement and a permanent one, so it is stated once on the scenario page
// rather than as a row of dashes republished forever.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measuresOf, scoreTool, type ToolReliability } from "../reliability/lib/score.ts";
import {
  buildReliabilityTable,
  parsePublishedReliability,
  reliabilityRowKey,
  toReliabilityRow,
  unrunRow,
  RELIABILITY_END,
  RELIABILITY_START,
  type ReliabilityRow,
} from "../reliability/lib/table.ts";
import { AWAITING_PROJECT, RELIABILITY_TOOLS } from "../reliability/lib/tools.ts";
import { TOOLS } from "../cases/lib/drivers/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = process.env.RESULTS_DIR ?? "results";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp";
const README = resolve(ROOT, "README.md");

const rows: ReliabilityRow[] = [];
const fresh = new Set<string>();

// One directory per job, named after the tool it ran.
const artifacts = existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).sort() : [];
for (const dir of artifacts) {
  if (!dir.startsWith("reliability-")) continue;
  const file = join(RESULTS_DIR, dir, "reliability-output.txt");
  if (!existsSync(file)) continue;
  const lines = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("RELIABILITY_RESULT "));
  if (lines.length === 0) continue;
  try {
    const result: ToolReliability = JSON.parse(
      lines[lines.length - 1].slice("RELIABILITY_RESULT ".length)
    );
    const score = scoreTool(result);
    const row = toReliabilityRow(score, measuresOf(score));
    rows.push(row);
    fresh.add(reliabilityRowKey(row));
  } catch (err) {
    console.error(`Could not parse a reliability result from ${file}: ${err}`);
  }
}

const readme = existsSync(README) ? readFileSync(README, "utf8") : "";

/** The rows this run is supposed to publish, by tool and source together. */
const measured = new Map(
  RELIABILITY_TOOLS.map((tool) => [`${TOOLS[tool].name}|${TOOLS[tool].source}`, TOOLS[tool]])
);

// Anything measured before and not this time keeps its last published row.
for (const prior of parsePublishedReliability(readme)) {
  const key = reliabilityRowKey(prior);
  if (fresh.has(key)) continue;
  // Only a real result is worth carrying. A row of dashes is not a stale
  // measurement, it is the absence of one, and its reason is rebuilt from the
  // registry below — so a reason that has since changed is not republished
  // from a table, and a tool that has since stopped being measured does not
  // linger because it was once printed.
  if (prior.overall.asked === 0 || !measured.has(key)) continue;
  rows.push({ ...prior, carriedOver: true });
}

// A tool with no row at all — nothing fresh, nothing published — is waiting on
// its first run rather than missing.
for (const [key, presentation] of measured) {
  if (rows.some((row) => reliabilityRowKey(row) === key)) continue;
  rows.push(unrunRow(presentation, "not measured yet: no run has published a result"));
}

for (const [tool, reason] of Object.entries(AWAITING_PROJECT)) {
  rows.push(unrunRow(TOOLS[tool], reason));
}

const table = buildReliabilityTable(rows);
console.log(table);
writeFileSync(join(OUT_DIR, "reliability-table.md"), table);

// Which tools reported this run, so a comment can say what it actually
// covered rather than leaving a reader to infer it from the dashes.
writeFileSync(
  join(OUT_DIR, "reliability-reported.txt"),
  [...fresh].map((key) => key.split("|")[0]).join("\n")
);

if (process.env.UPDATE_README === "1") {
  if (!readme) {
    console.error("No README.md to update.");
    process.exit(1);
  }
  const start = readme.indexOf(RELIABILITY_START);
  const end = readme.indexOf(RELIABILITY_END);
  if (start === -1 || end === -1) {
    console.error(`No ${RELIABILITY_START} marker in README.md; nothing was written.`);
    process.exit(1);
  }
  writeFileSync(
    README,
    `${readme.slice(0, start + RELIABILITY_START.length)}\n${table}\n${readme.slice(end)}`
  );
  console.log(`\nWrote the table into ${README}`);
}
