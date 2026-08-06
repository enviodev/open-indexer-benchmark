// Collects the reliability jobs' output into the tables the README publishes.
//
//   node scripts/build-reliability-tables.ts
//
// Each job runs one tool through one scenario and prints a RELIABILITY_RESULT
// line. This reads them all back, renders them with the same module the local
// runner uses, and writes:
//
//   /tmp/reliability-summary.md   the matrix that goes in the README
//   /tmp/reliability-detail.md    per-scenario tables, for the job summary and
//                                 the pull request comment
//
// A tool whose job produced no line at all is published as an unmeasured row
// rather than dropped, so a crashed runner cannot be mistaken for a tool that
// was never in the run.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildReport, buildSummaryTable } from "../reliability/lib/report.ts";
import { SCENARIOS, scenarioByKey } from "../reliability/lib/scenarios/index.ts";
import { TOOLS, TOOL_INFO } from "../reliability/lib/drivers/index.ts";
import type { ScenarioResult } from "../reliability/lib/harness.ts";

const RESULTS_DIR = process.env.RESULTS_DIR ?? "results";
const OUT_DIR = process.env.OUT_DIR ?? "/tmp";
const PREFIX = "RELIABILITY_RESULT ";

const results: ScenarioResult[] = [];

const dirs = existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).sort() : [];
for (const dir of dirs) {
  const file = join(RESULTS_DIR, dir, "reliability-output.txt");
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith(PREFIX)) continue;
    try {
      results.push(JSON.parse(line.slice(PREFIX.length)));
    } catch (err) {
      console.error(`Skipping an unparseable result line in ${file}: ${err}`);
    }
  }
}

// A scenario the run did not cover at all is left out of the matrix entirely;
// a scenario it covered for some tools keeps a row for the rest, marked
// unmeasured, because that is a job that failed rather than a tool that was
// not asked.
const covered = SCENARIOS.filter((scenario) =>
  results.some((result) => result.scenario === scenario.key)
);

const missing: string[] = [];
for (const scenario of covered) {
  for (const tool of TOOLS) {
    if (results.some((r) => r.scenario === scenario.key && r.tool === tool)) continue;
    missing.push(`${tool}/${scenario.key}`);
    results.push({
      scenario: scenario.key,
      tool,
      toolName: TOOL_INFO[tool]?.name ?? tool,
      toolUrl: TOOL_INFO[tool]?.url ?? "",
      status: "error",
      detail: "the job reported no result; see the workflow run logs",
      crashes: 0,
      restarts: 0,
      worstRecoveryMs: null,
      crashDetail: "",
      seconds: 0,
    });
  }
}

if (covered.length === 0) {
  console.error("No reliability results found.");
  process.exit(1);
}

// Scenario keys are what the workflow matrix is written in, so a mismatch
// between the two is worth failing on rather than publishing around. Checked
// before anything is written: the workflow's README step runs even when a
// previous step failed, so a non-zero exit here does not stop a file this
// script had already produced from being committed.
for (const result of results) {
  if (!scenarioByKey(result.scenario)) {
    console.error(`Unknown scenario "${result.scenario}" in the collected results.`);
    process.exit(1);
  }
}

writeFileSync(join(OUT_DIR, "reliability-summary.md"), buildSummaryTable(results, covered));
writeFileSync(join(OUT_DIR, "reliability-detail.md"), buildReport(results, covered));

console.log(
  `Collected ${results.length - missing.length} result(s) across ` +
    `${covered.length} scenario(s).`
);
if (missing.length > 0) {
  console.log(`No result reported for: ${missing.join(", ")}`);
  writeFileSync(join(OUT_DIR, "reliability-missing.txt"), missing.join("\n"));
}
