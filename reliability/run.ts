// Runs the reliability scenarios.
//
//   node reliability/run.ts                          every tool, every scenario
//   node reliability/run.ts ponder envio              two tools
//   node reliability/run.ts --scenarios=reorg,db-outage
//   node reliability/run.ts ponder --keep-db          leave the rows to look at
//   node reliability/run.ts --jobs=1                  one tool at a time
//
// Tools run concurrently and their scenarios run one after another.
//
// Nothing here reads a real data source, so there is no shared endpoint to
// contend for and no reason to serialise the way the throughput benchmark does:
// each tool gets its own generated chain, its own endpoint port and its own
// PostgreSQL container. What cannot overlap is two scenarios of the *same* tool,
// which would write the same project directory and bind the same ports, so each
// tool is a lane and the lanes run in parallel.
//
// The timings a scenario reports — head latency, resume time — are still
// sensitive to what else is on the machine. CI gives every (tool, scenario) pair
// its own runner and is the measurement of record; `--jobs=1` is the local
// equivalent when a number matters.
//
// No API tokens and no network: the chain is generated in-process, which is
// what makes these results reproducible in a way head-of-chain measurements
// never are.

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_RPC_PORT, runScenario, stopAllDrivers, type ScenarioResult } from "./lib/harness.ts";
import { BASE_PORT, PostgresServer } from "./lib/postgres.ts";
import { buildReport, summariseRun } from "./lib/report.ts";
import { SCENARIO_KEYS, scenarioByKey } from "./lib/scenarios/index.ts";
import { TOOL_INFO, TOOLS } from "./lib/drivers/index.ts";

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
 * Leave the database containers up at the end. A published failure is only
 * worth publishing if someone can go and look at the rows behind it, and by
 * default the container that held them is gone by the time the table is
 * printed.
 */
const keepDatabase = process.argv.includes("--keep-db");

/** How many tools to run at once. */
const jobsFlag = process.argv.find((arg) => arg.startsWith("--jobs="));
const jobs = jobsFlag ? Number(jobsFlag.slice("--jobs=".length)) : tools.length;
if (!Number.isInteger(jobs) || jobs < 1) {
  console.error("Error: --jobs must be a positive whole number of tools.");
  process.exit(1);
}

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

/** One PostgreSQL per tool, on its own port, so lanes cannot disturb each other. */
const databases = new Map(
  tools.map((tool, index) => [
    tool,
    new PostgresServer({ name: `reliability-postgres-${tool}`, port: BASE_PORT + index }),
  ])
);

// Containers and indexer processes outlive this script if it is interrupted, so
// tear them down on the way out however that happens.
let tearingDown = false;
async function teardown(code: number) {
  if (tearingDown) return;
  tearingDown = true;
  await stopAllDrivers();
  if (!keepDatabase) {
    await Promise.all([...databases.values()].map((db) => db.stopContainer().catch(() => {})));
  }
  process.exit(code);
}
process.on("SIGINT", () => void teardown(130));
process.on("SIGTERM", () => void teardown(143));

console.log("=== Reliability ===");
console.log(`Tools: ${tools.join(", ")}`);
console.log(`Scenarios: ${scenarioKeys.join(", ")}`);
console.log(`Running ${Math.min(jobs, tools.length)} tool(s) at a time\n`);

const results: ScenarioResult[] = [];

/** Every scenario for one tool, in order, against that tool's own database. */
async function runTool(tool: string, index: number): Promise<void> {
  const db = databases.get(tool)!;
  console.log(`[${tool}] starting PostgreSQL on port ${db.port}...`);
  await db.start();

  try {
    for (const scenario of selected) {
      console.log(`\n[${tool}] --- ${scenario.title} ---\n`);
      let result: ScenarioResult;
      try {
        result = await runScenario(tool, scenario, db, ROOT, {
          rpcPort: BASE_RPC_PORT + index,
          label: tool,
        });
      } catch (err) {
        // A scenario that throws outside the harness — a driver that cannot
        // even be constructed, say — is still a result about that tool.
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
        `\n[${tool}] ${scenario.title}: ${result.status}` +
          (result.detail ? ` (${result.detail})` : "") +
          ` after ${result.seconds.toFixed(0)}s`
      );
      // Machine-readable line, consumed by the CI summary job.
      console.log(`RELIABILITY_RESULT ${JSON.stringify(result)}`);
    }
  } finally {
    if (!keepDatabase) await db.stopContainer().catch(() => {});
  }
}

// Lanes, `jobs` at a time. Workers pull from one shared queue rather than being
// handed a fixed share, so a slow tool does not leave a worker idle behind it.
const queue = tools.map((tool, index) => ({ tool, index }));
await Promise.all(
  Array.from({ length: Math.min(jobs, tools.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await runTool(next.tool, next.index);
    }
  })
);

if (keepDatabase) {
  console.log("\nLeaving the databases up:");
  for (const [tool, db] of databases) {
    console.log(`  ${tool}: psql "${db.urlFor(TOOL_INFO[tool].database)}"`);
  }
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
