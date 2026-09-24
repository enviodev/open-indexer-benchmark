// Collects per-indexer benchmark output into one table per case.
//
//   CASES='["erc20-transfer-events"]' node scripts/build-tables.ts
//
// Reads the BENCHMARK_RESULT lines emitted by each benchmark job, renders them
// with the same module the local runner uses, and writes one Markdown table per
// case for the PR comment and the README update to pick up.
//
// A run can measure each tool more than once — one artifact per round, named
// `benchmark-<case>--<indexer>--r<N>`, plus `--recheck` for a row the gate
// sent back — and the row published is the median of those samples (see
// cases/lib/aggregate.ts). GATE decides what happens to a row that moved a
// long way from its published value:
//
//   off      publish the median regardless (pull requests, manual runs)
//   recheck  list the rows to measure again in benchmark-recheck.json
//   final    the recheck has run; publish, and note a row still disagreeing
//
// TOUCHED_INDEXERS, a {case: [indexer]} map, names the rows whose code the
// push changed; those are expected to move and are never held back.

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTable,
  formatRate,
  parsePublishedTable,
  rowKey,
  type TableRow,
} from "../cases/lib/table.ts";
import { toTableRow, type BenchmarkResult } from "../cases/lib/result.ts";
import { judge, parseArtifactIndexer, pickMedian } from "../cases/lib/aggregate.ts";
import { TOOLS } from "../cases/lib/drivers/index.ts";

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

const gate = process.env.GATE ?? "off";
if (!["off", "recheck", "final"].includes(gate)) {
  console.error(`Error: GATE must be off, recheck or final, not "${gate}".`);
  process.exit(1);
}
const touched: Record<string, string[]> = process.env.TOUCHED_INDEXERS
  ? JSON.parse(process.env.TOUCHED_INDEXERS)
  : {};
/**
 * The recheck pass only decides what to measure again; the publish pass that
 * follows it repeats every warning, so this one keeps quiet rather than
 * annotating the run twice.
 */
const annotate = gate !== "recheck";
/** Rows to measure again, by case — written out in recheck mode. */
const recheck: Record<string, string[]> = {};

/**
 * Scenario names live in each case's config so the README, the job summary and
 * the PR comment cannot drift apart. Falling back to the slug keeps a new case
 * publishing results even before it has a config to import.
 */
/**
 * Rows a scenario publishes but never runs here: a tool it keeps local-only is
 * measured by hand and committed, so its row is carried forward on every run
 * by design. Warning about those would cry wolf on every push.
 */
async function localOnlyRowKeys(name: string): Promise<Set<string>> {
  try {
    const mod = await import(resolve(ROOT, "cases", name, "case.config.ts"));
    const localOnly: string[] = mod.caseConfig?.localOnly ?? [];
    return new Set(
      localOnly
        .filter((indexer) => TOOLS[indexer])
        .map((indexer) => `${TOOLS[indexer].name}|${TOOLS[indexer].source}`)
    );
  } catch {
    return new Set();
  }
}

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

// Overridable so scripts/test-aggregate.ts can gate against a README of its own.
const readmePath = process.env.README_PATH ?? resolve(ROOT, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

const artifactDirs = existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).sort() : [];

for (const benchCase of cases) {
  const title = await caseTitle(benchCase);
  const prefix = `benchmark-${benchCase}--`;
  const rows: TableRow[] = [];
  const published = new Map(
    parsePublishedTable(readme, benchCase).map((row) => [rowKey(row), row] as const)
  );

  // Which indexers reported this run, by id. The artifact directory is named
  // after the job that wrote it, so this is the one place a row can be tied
  // back to the indexer the workflow selected.
  const reported = new Set<string>();
  const samples = new Map<string, BenchmarkResult[]>();

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
      const { indexer } = parseArtifactIndexer(dir.slice(prefix.length));
      samples.set(indexer, [...(samples.get(indexer) ?? []), result]);
      reported.add(indexer);
    } catch (err) {
      console.error(`Could not parse a result from ${file}: ${err}`);
    }
  }

  const spread: string[] = [];
  for (const [indexer, results] of samples) {
    const row = toTableRow(pickMedian(results));
    const rates = results.map((r) => r.eventsPerSec);
    const prior = published.get(rowKey(row));
    const verdict = judge({
      samples: rates,
      published: prior && !prior.unsupported ? prior.eventsPerSec : null,
      touched: (touched[benchCase] ?? []).includes(indexer),
      final: gate !== "recheck",
    });
    const label = `${row.name} via ${results[0].source}`;

    if (gate !== "off" && verdict.kind === "shift") {
      console.log(
        `::notice::${title}: ${label} moved from ${formatRate(verdict.from)} to ` +
          `${formatRate(verdict.to)} events/s, and all ${rates.length} runs agree — publishing.`
      );
    } else if (gate !== "off" && verdict.kind === "recheck") {
      console.log(
        `${title}: ${label} moved from ${formatRate(verdict.from)} to ` +
          `${formatRate(verdict.to)} events/s and its runs disagree — measuring it again.`
      );
      (recheck[benchCase] ??= []).push(indexer);
    } else if (gate !== "off" && verdict.kind === "unstable") {
      console.log(`::warning::${title}: ${label} — ${verdict.note}.`);
      row.unstable = verdict.note;
    }
    rows.push(row);

    if (rates.length > 1) {
      const sorted = [...rates].sort((a, b) => a - b);
      spread.push(
        `| ${label} | ${rates.length} | ${formatRate(sorted[0])} | ` +
          `${formatRate(row.eventsPerSec)} | ${formatRate(sorted[sorted.length - 1])} |`
      );
    }
  }

  // Re-publish any indexer that produced no fresh result this run. Rebuilding
  // from successful jobs alone would silently drop its row, which reads as
  // "no longer benchmarked" rather than "this job failed".
  const fresh = new Set(rows.map(rowKey));
  const localOnly = await localOnlyRowKeys(benchCase);
  const carried: string[] = [];
  for (const prior of published.values()) {
    if (fresh.has(rowKey(prior))) continue;
    // A local-only row is carried by design — it has no job that could have
    // failed — so it is marked stale in the table rather than warned about.
    const isLocal = localOnly.has(rowKey(prior));
    rows.push({ ...prior, carriedOver: true, ...(isLocal ? { localOnly: true } : {}) });
    if (!isLocal) carried.push(`${prior.name} via ${prior.cells.source}`);
  }
  // A run scoped to part of the matrix — a pull request — carries most rows
  // forward by design, so annotating those as failures would cry wolf on
  // every pull request. An indexer that was selected and still reported
  // nothing is a failed job, and has to stay loud even on such a run — not
  // only in this log, but in the PR comment, whose scope note would otherwise
  // pass the failure off as a benign carry-forward. The comment step cannot
  // import this module, so the list is handed over as a file, like the table.
  const failed = selected ? (selected[benchCase] ?? []).filter((i) => !reported.has(i)) : null;
  if (failed !== null && failed.length > 0) {
    writeFileSync(join(OUT_DIR, `benchmark-failed-${benchCase}.txt`), failed.join("\n"));
  }
  if (carried.length > 0 && annotate) {
    const message =
      `${title}: no fresh result for ${carried.join(", ")} this run — ` +
      `carried forward the last published value(s).`;
    if (failed === null || failed.length > 0) {
      const detail = failed === null ? "" : ` Selected but reported nothing: ${failed.join(", ")}.`;
      console.log(`::warning::${message}${detail} Check the failed job(s).`);
    } else {
      console.log(`${message} Not selected to run by this run's scope.`);
    }
  } else if (failed !== null && failed.length > 0 && annotate) {
    // No published row to carry either: the indexer vanishes from the table
    // entirely, which is even easier to miss than a stale row.
    console.log(
      `::warning::${title}: ${failed.join(", ")} selected but reported nothing, ` +
        `and no published row to carry forward. Check the failed job(s).`
    );
  }

  const table = buildTable(rows);
  writeFileSync(join(OUT_DIR, `benchmark-table-${benchCase}.md`), table);
  // The README publishes results; the pull request comment reports on a run.
  // Which rows this particular run happened to re-measure is the second thing,
  // not the first — a reader of the README wants the numbers, and a row marked
  // stale forever because its tool is measured by hand reads as a defect. The
  // correctness and unsupported notes stay in both: those are about the data,
  // not about which job produced it.
  writeFileSync(
    join(OUT_DIR, `benchmark-readme-${benchCase}.md`),
    buildTable(rows.map((row) => ({ ...row, carriedOver: false, localOnly: false })))
  );
  // The PR comment is assembled by a workflow step that cannot import this
  // module, so the resolved name is handed over as a file.
  writeFileSync(join(OUT_DIR, `benchmark-title-${benchCase}.txt`), title);

  if (process.env.GITHUB_STEP_SUMMARY && process.env.WRITE_SUMMARY !== "0") {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## ${title}\n\n${table}\n\n`
    );
    // The spread behind each median, which the table itself does not show.
    if (spread.length > 0) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `<details><summary>Samples per row (events/s)</summary>\n\n` +
          `| row | runs | min | median | max |\n| --- | --- | --- | --- | --- |\n` +
          `${spread.join("\n")}\n\n</details>\n\n`
      );
    }
  }
  console.log(`\n## ${title}\n\n${table}`);
}

if (gate === "recheck") {
  writeFileSync(join(OUT_DIR, "benchmark-recheck.json"), JSON.stringify(recheck));
  const count = Object.values(recheck).flat().length;
  console.log(
    count === 0
      ? "\nNo row needs measuring again."
      : `\n${count} row(s) to measure again: ${JSON.stringify(recheck)}`
  );
}
