// Collects per-indexer benchmark output into one table per case.
//
//   CASES='["erc20-transfer-events"]' node scripts/build-tables.ts
//
// Reads the BENCHMARK_RESULT lines emitted by each benchmark job, renders them
// with the same module the local runner uses, and writes one Markdown table per
// case for the PR comment and the README update to pick up.

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTable, parsePublishedTable, rowKey, type TableRow } from "../cases/lib/table.ts";
import { toTableRow, type BenchmarkResult } from "../cases/lib/runner.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = process.env.RESULTS_DIR ?? "results";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp";

const cases: string[] = JSON.parse(process.env.CASES ?? "[]");
if (cases.length === 0) {
  console.error("Error: CASES must be a JSON array of case names.");
  process.exit(1);
}

const titleCase = (name: string) =>
  name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const readmePath = resolve(ROOT, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

const artifactDirs = existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).sort() : [];

for (const benchCase of cases) {
  const prefix = `benchmark-${benchCase}--`;
  const rows: TableRow[] = [];

  for (const dir of artifactDirs) {
    if (!dir.startsWith(prefix)) continue;
    const file = join(RESULTS_DIR, dir, "benchmark-output.txt");
    if (!existsSync(file)) continue;

    // A job runs one indexer, so there is at most one result line; take the
    // last in case the log was appended to across retries.
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.startsWith("BENCHMARK_RESULT "));
    if (lines.length === 0) continue;

    try {
      const result: BenchmarkResult = JSON.parse(
        lines[lines.length - 1].slice("BENCHMARK_RESULT ".length)
      );
      rows.push(toTableRow(result));
    } catch (err) {
      console.error(`Could not parse a result from ${file}: ${err}`);
    }
  }

  // Re-publish any indexer that produced no fresh result this run. Rebuilding
  // from successful jobs alone would silently drop its row, which reads as
  // "no longer benchmarked" rather than "this job failed".
  const fresh = new Set(rows.map(rowKey));
  const carried: string[] = [];
  for (const prior of parsePublishedTable(readme, benchCase)) {
    if (fresh.has(rowKey(prior))) continue;
    rows.push({ ...prior, carriedOver: true });
    carried.push(rowKey(prior).replace("|", " via "));
  }
  if (carried.length > 0) {
    console.log(
      `::warning::${titleCase(benchCase)}: no fresh result for ${carried.join(", ")} ` +
        `this run — carried forward the last published value(s). Check the failed job(s).`
    );
  }

  const table = buildTable(rows);
  writeFileSync(join(OUT_DIR, `benchmark-table-${benchCase}.md`), table);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${titleCase(benchCase)} Benchmark\n\n${table}\n\n`
    );
  }
  console.log(`\n## ${titleCase(benchCase)}\n\n${table}`);
}
