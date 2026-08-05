// Runs the reliability scenarios.
//
//   node reliability/run.ts                          every tool, every scenario
//   node reliability/run.ts ponder envio              two tools
//   node reliability/run.ts --scenarios=reorg,db-outage
//   node reliability/run.ts ponder --keep-db          leave the rows to look at
//
// Everything runs one at a time. The scenarios share a PostgreSQL container, a
// fixed RPC port and the machine's CPU, and half of them measure how long
// something took — none of which survives two runs at once. CI parallelises by
// giving each (scenario, tool) pair its own runner instead.
//
// No API tokens and no network: the chain is generated in-process, which is
// what makes these results reproducible in a way head-of-chain measurements
// never are.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sleep } from "../cases/lib/process.ts";
import { runScenario, type ScenarioResult } from "./lib/harness.ts";
import { PostgresServer } from "./lib/postgres.ts";
import { buildReport, summariseRun } from "./lib/report.ts";
import { SCENARIOS, SCENARIO_KEYS, scenarioByKey } from "./lib/scenarios/index.ts";
import { TOOLS } from "./lib/drivers/index.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

function parseList(flag: string): string[] | null {
  const arg = process.argv.find((value) => value.startsWith(`--${flag}=`));
  if (!arg) return null;
  return arg
    .slice(flag.length + 3)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const tools = positional.length > 0 ? positional : TOOLS;
const scenarioKeys = parseList("scenarios") ?? SCENARIO_KEYS;

/**
 * Leave the database container up at the end. A published failure is only worth
 * publishing if someone can go and look at the rows behind it, and by default
 * the container that held them is gone by the time the table is printed.
 */
const keepDatabase = process.argv.includes("--keep-db");

for (const tool of tools) {
  if (!TOOLS.includes(tool)) {
    console.error(`Unknown tool "${tool}". Available: ${TOOLS.join(", ")}`);
    process.exit(1);
  }
}
for (const key of scenarioKeys) {
  if (!scenarioByKey(key)) {
    console.error(`Unknown scenario "${key}". Available: ${SCENARIO_KEYS.join(", ")}`);
    process.exit(1);
  }
}

const selected = scenarioKeys.map((key) => scenarioByKey(key)!);
const db = new PostgresServer();

// The database container and any indexer process outlive this script if it is
// interrupted, so tear them down on the way out however that happens.
let tearingDown = false;
async function teardown(code: number) {
  if (tearingDown) return;
  tearingDown = true;
  if (!keepDatabase) await db.stopContainer().catch(() => {});
  process.exit(code);
}
process.on("SIGINT", () => void teardown(130));
process.on("SIGTERM", () => void teardown(143));

console.log("=== Reliability ===");
console.log(`Tools: ${tools.join(", ")}`);
console.log(`Scenarios: ${scenarioKeys.join(", ")}\n`);

console.log("Starting the shared PostgreSQL container...");
await db.start();

const results: ScenarioResult[] = [];

for (const scenario of selected) {
  for (const tool of tools) {
    console.log(`\n--- ${scenario.title} — ${tool} ---\n`);
    let result: ScenarioResult;
    try {
      result = await runScenario(tool, scenario, db, ROOT);
    } catch (err) {
      // A scenario that throws outside the harness — a driver that cannot even
      // be constructed, say — is still a result about that tool.
      result = {
        scenario: scenario.key,
        tool,
        toolName: tool,
        toolUrl: "",
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
        crashes: 0,
        restarts: 0,
        worstRecoveryMs: null,
        crashDetail: "",
        seconds: 0,
      };
    }
    results.push(result);
    console.log(
      `\n${scenario.title} — ${tool}: ${result.status}` +
        (result.detail ? ` (${result.detail})` : "") +
        ` after ${result.seconds.toFixed(0)}s`
    );
    // Machine-readable line, consumed by the CI summary job.
    console.log(`RELIABILITY_RESULT ${JSON.stringify(result)}`);
    // The database container was just restarted several times; give it a
    // moment before the next scenario resets a database on it.
    await sleep(2_000);
  }
}

if (keepDatabase) {
  console.log(`\nLeaving the database up: psql "${db.urlFor("rel_<tool>")}"`);
} else {
  await db.stopContainer().catch(() => {});
}

console.log(`\n=== Results ===\n`);
console.log(summariseRun(results));
console.log("");
console.log(buildReport(results, selected));

// A tool that failed a scenario is a result, not a broken run: the exit code
// reflects whether the harness could measure, not whether the tools passed.
const unmeasured = results.filter((result) => result.status === "error");
if (unmeasured.length > 0) {
  console.error(
    `\n${unmeasured.length} scenario run(s) could not be measured:\n` +
      unmeasured.map((r) => `  ${r.tool}/${r.scenario}: ${r.detail}`).join("\n")
  );
  process.exit(1);
}
