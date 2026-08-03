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
import { toTableRow, type BenchmarkResult } from "../cases/lib/result.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = process.env.RESULTS_DIR ?? "results";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp";

const cases: string[] = JSON.parse(process.env.CASES ?? "[]");
if (cases.length === 0) {
  console.error("Error: CASES must be a JSON array of case names.");
  process.exit(1);
}

/**
 * Which indexers each case was asked to run, when the run was scoped to part
 * of the matrix. Unset means every indexer was expected, so any row missing a
 * fresh result is a failed job.
 */
const selected: Record<string, string[]> | null = process.env.SELECTED_INDEXERS
  ? JSON.parse(process.env.SELECTED_INDEXERS)
  : null;

/**
 * Scenario names live in each case's config so the README, the job summary and
 * the PR comment cannot drift apart. Falling back to the slug keeps a new case
 * publishing results even before it has a config to import.
 */
async function caseTitle(name: string): Promise<string> {
  try {
    const mod = await import(resolve(ROOT, "cases", name, "case.config.ts"));
    if (mod.caseConfig?.title) return mod.caseConfig.title;
  } catch {}
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const readmePath = resolve(ROOT, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

const artifactDirs = existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).sort() : [];

for (const benchCase of cases) {
  const title = await caseTitle(benchCase);
  const prefix = `benchmark-${benchCase}--`;
  const rows: TableRow[] = [];

  // Which indexers reported this run, by id. The artifact directory is named
  // after the job that wrote it, so this is the one place a row can be tied
  // back to the indexer the workflow selected.
  const reported = new Set<string>();

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
      reported.add(dir.slice(prefix.length));
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
    carried.push(`${prior.name} via ${prior.cells.source}`);
  }
  if (carried.length > 0) {
    // A run scoped to part of the matrix — a pull request — carries most rows
    // forward by design, so annotating those as failures would cry wolf on
    // every pull request. An indexer that was selected and still reported
    // nothing is a failed job, and has to stay loud even on such a run.
    const failed = selected ? (selected[benchCase] ?? []).filter((i) => !reported.has(i)) : null;
    const message =
      `${title}: no fresh result for ${carried.join(", ")} this run — ` +
      `carried forward the last published value(s).`;
    if (failed === null || failed.length > 0) {
      const detail = failed === null ? "" : ` Selected but reported nothing: ${failed.join(", ")}.`;
      console.log(`::warning::${message}${detail} Check the failed job(s).`);
    } else {
      console.log(`${message} Not selected to run by this run's scope.`);
    }
  }

  const table = buildTable(rows);
  writeFileSync(join(OUT_DIR, `benchmark-table-${benchCase}.md`), table);
  // The PR comment is assembled by a workflow step that cannot import this
  // module, so the resolved name is handed over as a file.
  writeFileSync(join(OUT_DIR, `benchmark-title-${benchCase}.txt`), title);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${title}\n\n${table}\n\n`
    );
  }
  console.log(`\n## ${title}\n\n${table}`);
}
