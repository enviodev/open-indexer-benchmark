// Runs a scenario on this machine and writes its table into the README.
//
//   ENVIO_API_TOKEN=... SOLANA_RPC_URL=... node scripts/run-local.ts <case> [--commit]
//
// CI publishes the tables for scenarios every tool can be pointed at a shared
// endpoint for. A scenario with a row that reads an endpoint someone pays for
// by the request — Carbon on Solana — cannot be published that way, so it is
// measured by hand and the result committed. The table is rendered by the same
// module the CI summary uses, so a hand-run row and a published one cannot
// drift apart in format.
//
// Every tool the scenario implements is run, including the ones it keeps
// local-only. Pass indexer names after the case to narrow that, exactly as
// `node cases/<case>/run.ts` takes them.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTable, parsePublishedTable, rowKey } from "../cases/lib/table.ts";
import { toTableRow, type BenchmarkResult } from "../cases/lib/result.ts";
import { INDEXERS, TOOLS } from "../cases/lib/drivers/index.ts";
import { INDEXER_DIRS } from "./select-scope.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const [benchCase, ...requested] = positional;

if (!benchCase) {
  console.error(
    "usage: node scripts/run-local.ts <case> [indexer...] [--commit] [--duration=N]"
  );
  process.exit(1);
}

const caseDir = resolve(ROOT, "cases", benchCase);
if (!existsSync(resolve(caseDir, "run.ts"))) {
  console.error(`No scenario at cases/${benchCase}/run.ts`);
  process.exit(1);
}

const { caseConfig } = await import(resolve(caseDir, "case.config.ts"));

/**
 * What this machine can run: everything the scenario has a project for, less
 * what it declares unsupported. Unlike the CI matrix this keeps the local-only
 * tools — running them is the whole point of being here.
 */
const runnable = INDEXERS.filter(
  (indexer) =>
    !(indexer in (caseConfig.unsupported ?? {})) &&
    existsSync(resolve(caseDir, INDEXER_DIRS[indexer] ?? indexer))
);

const selected = requested.length > 0 ? requested : runnable;
const unknown = selected.filter((i) => !runnable.includes(i));
if (unknown.length > 0) {
  console.error(
    `${benchCase} has no project for: ${unknown.join(", ")}. ` +
      `It runs: ${runnable.join(", ")}`
  );
  process.exit(1);
}

console.log(`Running ${benchCase}: ${selected.join(", ")}\n`);

const passthrough = args.filter((a) => a.startsWith("--") && a !== "--commit");
const results = await runCase([...selected, ...passthrough]);

if (results.length === 0) {
  console.error("\nThe run produced no results; the README is left alone.");
  process.exit(1);
}

const readmePath = resolve(ROOT, "README.md");
const readme = readFileSync(readmePath, "utf8");

// Rows this run produced win; anything already published that it did not
// re-measure is kept and marked stale. Rebuilding from fresh rows alone would
// delete a tool's row whenever the run was narrowed to one indexer, or
// whenever one of them failed.
//
// A tool the scenario keeps local-only is carried the same way but says so
// differently: its numbers are as real as any other row's, just from whenever
// someone last ran it, so it must not read as a job that produced nothing.
// This is the marking scripts/build-tables.ts applies for the CI summary, and
// the two have to agree or the same row reads one way on a push and another
// after a local run.
const localOnlyRows = new Set(
  ((caseConfig.localOnly as string[] | undefined) ?? [])
    .filter((indexer) => TOOLS[indexer])
    .map((indexer) => `${TOOLS[indexer].name}|${TOOLS[indexer].source}`)
);
const rows = results.map(toTableRow);
const fresh = new Set(rows.map(rowKey));
for (const prior of parsePublishedTable(readme, benchCase)) {
  if (fresh.has(rowKey(prior))) continue;
  const isLocal = localOnlyRows.has(rowKey(prior));
  rows.push({ ...prior, carriedOver: true, ...(isLocal ? { localOnly: true } : {}) });
}
// The README publishes results, so it carries no mark for which rows this run
// re-measured — see scripts/build-tables.ts, which does the same for CI.
const table = buildTable(
  rows.map((row) => ({ ...row, carriedOver: false, localOnly: false }))
);
const start = `<!-- BENCHMARK:${benchCase}:START -->`;
const end = `<!-- BENCHMARK:${benchCase}:END -->`;
const from = readme.indexOf(start);
const to = readme.indexOf(end);
if (from === -1 || to === -1) {
  console.error(`README.md has no ${start} … ${end} block to write into.`);
  process.exit(1);
}

writeFileSync(
  readmePath,
  readme.slice(0, from + start.length) + `\n${table}\n` + readme.slice(to)
);
console.log(`\nWrote the ${benchCase} table into README.md:\n\n${table}`);

if (commit) {
  await run("git", ["add", "README.md"]);
  await run("git", [
    "commit",
    "-m",
    `Publish ${caseConfig.title ?? benchCase} results from a local run`,
  ]);
  console.log("\nCommitted. Push when you are happy with it.");
} else {
  console.log("\nRe-run with --commit to commit the README change.");
}

/**
 * Run the scenario, echoing its output as it goes and collecting the result
 * lines. The runner prints one `BENCHMARK_RESULT <json>` per tool, which is
 * the same handoff the CI jobs use.
 */
function runCase(argv: string[]): Promise<BenchmarkResult[]> {
  return new Promise((res, rej) => {
    const child = spawn("node", [resolve(caseDir, "run.ts"), ...argv], {
      cwd: ROOT,
      stdio: ["inherit", "pipe", "inherit"],
    });
    const results: BenchmarkResult[] = [];
    let pending = "";

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      pending += chunk.toString();
      const lines = pending.split("\n");
      // The last piece may be half a line; it waits for the rest.
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("BENCHMARK_RESULT ")) continue;
        try {
          results.push(JSON.parse(line.slice("BENCHMARK_RESULT ".length)));
        } catch (err) {
          console.error(`Could not parse a result line: ${err}`);
        }
      }
    });

    child.on("exit", (code) =>
      // A tool that fails is a result in its own right — the others still have
      // a row, and refusing to publish them would lose a whole run to one
      // failure.
      code === 0 || results.length > 0
        ? res(results)
        : rej(new Error(`the scenario exited with code ${code}`))
    );
  });
}

function run(cmd: string, argv: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, argv, { cwd: ROOT, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`"${cmd}" exited with code ${code}`))
    );
  });
}
