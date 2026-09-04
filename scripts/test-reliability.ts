// Tests reliability scoring and the table it publishes.
//
//   node scripts/test-reliability.ts
//
// Three things are load-bearing here. The catalog, because a check that is
// scored without being explained — or explained without being scored — is a
// number nobody can check. The arithmetic, because every published score is a
// claim about a tool and the way it is reached is the only defence of it. And
// the parser, because a failed reliability job would otherwise delete a tool's
// row from the README, which reads as "no longer measured" rather than "the
// job failed".
//
// It needs no credentials and starts nothing: the observations are written by
// hand, which is the point — the scoring has to be checkable without a run.

import { existsSync, readFileSync } from "node:fs";
import {
  CANDIDATES,
  GROUPS,
  SCENARIOS,
  checkCount,
} from "../cases/lib/reliability/scenarios.ts";
import {
  measuresOf,
  scoreTool,
  tallyRank,
  type ToolReliability,
} from "../cases/lib/reliability/score.ts";
import {
  buildReliabilityTable,
  parsePublishedReliability,
  reliabilityRowKey,
  toReliabilityRow,
  RELIABILITY_END,
  RELIABILITY_START,
} from "../cases/lib/reliability/table.ts";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`ok ${name}`);
    return;
  }
  console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ""}`);
  failures++;
}

// ── The catalog ────────────────────────────────────────────────────────

check(
  "every scenario belongs to a published group",
  SCENARIOS.every((scenario) => GROUPS.some((group) => group.id === scenario.group)),
  SCENARIOS.filter((s) => !GROUPS.some((g) => g.id === s.group)).map((s) => s.id).join(", ")
);
check(
  "every group holds at least one scenario",
  GROUPS.every((group) => SCENARIOS.some((scenario) => scenario.group === group.id)),
  GROUPS.filter((g) => !SCENARIOS.some((s) => s.group === g.id)).map((g) => g.id).join(", ")
);
check(
  "scenario ids are unique",
  new Set(SCENARIOS.map((s) => s.id)).size === SCENARIOS.length
);
check(
  "check ids are unique within a scenario",
  SCENARIOS.every((s) => new Set(s.checks.map((c) => c.id)).size === s.checks.length)
);
// Every check moves a published number by the same amount, so a scenario that
// asks nothing is a column that cannot be scored, and a check nobody would
// argue about is dilution rather than evidence.
check(
  "every scenario asks at least two checks",
  SCENARIOS.every((s) => checkCount(s) >= 2),
  SCENARIOS.map((s) => `${s.id}=${checkCount(s)}`).join(", ")
);
// An anchor is a link target the results table hard-codes, so two of them
// answering to the same name would send half the readers to the wrong section.
check(
  "no scenario id collides with a group id",
  SCENARIOS.every((scenario) => !GROUPS.some((group) => group.id === scenario.id)),
  SCENARIOS.filter((s) => GROUPS.some((g) => g.id === s.id)).map((s) => s.id).join(", ")
);
check(
  "every check explains what a pass means",
  SCENARIOS.every((s) => s.checks.every((c) => c.detail.length > 40 && c.label.length > 0))
);
check(
  "every candidate names a real column, or asks for a new one",
  CANDIDATES.every(
    (candidate) =>
      candidate.group === "new" || GROUPS.some((group) => group.id === candidate.group)
  ),
  CANDIDATES.filter(
    (c) => c.group !== "new" && !GROUPS.some((g) => g.id === c.group)
  ).map((c) => c.title).join(", ")
);
// The backlog is only useful if it stays a backlog: a candidate already built
// would be a page telling readers something is missing when it is not.
check(
  "no candidate duplicates a scenario already in the suite",
  CANDIDATES.every(
    (candidate) =>
      !SCENARIOS.some(
        (scenario) => scenario.title.toLowerCase() === candidate.title.toLowerCase()
      )
  )
);
check(
  "no group publishes two headline measures",
  GROUPS.every(
    (group) =>
      SCENARIOS.filter((s) => s.group === group.id).flatMap((s) =>
        (s.measures ?? []).filter((m) => m.headline)
      ).length <= 1
  )
);

// ── Scoring ────────────────────────────────────────────────────────────

const pass = { status: "pass" } as const;
const fail = (detail: string) => ({ status: "fail" as const, detail });

/** A tool that passes everything, so a perfect score has a fixture. */
function perfect(name: string): ToolReliability {
  return {
    name,
    toolUrl: "https://example.test",
    source: "RPC",
    sourceUrl: "https://rpc.test",
    runs: SCENARIOS.map((scenario) => ({
      scenario: scenario.id,
      checks: Object.fromEntries(scenario.checks.map((c) => [c.id, pass])),
    })),
  };
}

const ALL_CHECKS = SCENARIOS.reduce((n, s) => n + checkCount(s), 0);
const flawless = scoreTool(perfect("Perfect"));
check(
  "a tool that passes everything passes every check",
  flawless.passed === ALL_CHECKS && flawless.asked === ALL_CHECKS,
  `${flawless.passed}/${flawless.asked} of ${ALL_CHECKS}`
);

const halfReorgs = perfect("Half");
halfReorgs.runs = halfReorgs.runs.map((run) =>
  run.scenario === "reorg-cases"
    ? {
        ...run,
        checks: {
          ...run.checks,
          // 20 of the scenario's 100 points.
          "removes-event": fail("kept rows for events the chain discarded"),
        },
      }
    : run
);
const half = scoreTool(halfReorgs);
const halfReorgTally = half.groups.find((g) => g.group === "reorgs");
check(
  "a failed check costs exactly one check",
  halfReorgTally?.passed === 5 && halfReorgTally?.asked === 6,
  JSON.stringify(halfReorgTally && [halfReorgTally.passed, halfReorgTally.asked])
);
check(
  "and costs exactly one check of the overall, wherever it happened",
  half.passed === ALL_CHECKS - 1 && half.asked === ALL_CHECKS,
  `${half.passed}/${half.asked}`
);

// A question the run could not put must not read as a failure: it leaves both
// sides of the fraction, so the score is over what was actually asked.
const skipped = perfect("Skipped");
skipped.runs = skipped.runs.map((run) =>
  run.scenario === "reorg-cases"
    ? {
        ...run,
        checks: {
          ...run.checks,
          deep: { status: "na", detail: "the tool exited before the deep reorg" },
        },
      }
    : run
);
const skippedReorgs = scoreTool(skipped).groups.find((g) => g.group === "reorgs");
check(
  "an unmeasured check leaves the fraction rather than failing",
  skippedReorgs?.passed === 5 && skippedReorgs?.asked === 5,
  JSON.stringify(skippedReorgs && [skippedReorgs.passed, skippedReorgs.asked])
);

const unmeasured = scoreTool({
  ...perfect("Unmeasured"),
  runs: SCENARIOS.filter((s) => s.group !== "head-latency").map((scenario) => ({
    scenario: scenario.id,
    checks: Object.fromEntries(scenario.checks.map((c) => [c.id, pass])),
  })),
});
const headLatency = unmeasured.groups.find((g) => g.group === "head-latency");
check(
  "a group nothing was measured in asks nothing, rather than failing",
  headLatency?.asked === 0 && headLatency?.passed === 0
);
check(
  "and shrinks the overall's denominator instead of its numerator",
  unmeasured.passed === unmeasured.asked && unmeasured.asked < ALL_CHECKS,
  `${unmeasured.passed}/${unmeasured.asked} of ${ALL_CHECKS}`
);

// A tool asked fewer questions must not outrank one that answered more of them
// only because the ones it was spared would have been failures.
{
  const partialRun = scoreTool({
    ...perfect("Sparse"),
    runs: [
      {
        scenario: "reorg-cases",
        checks: { shallow: pass, "removes-event": pass },
      },
    ],
  });
  const [sparseShare] = tallyRank(partialRun);
  const [flawlessShare, flawlessPassed] = tallyRank(flawless);
  check(
    "a perfect run over two checks ties on share but loses on count",
    sparseShare === flawlessShare && flawlessPassed > partialRun.passed,
    `${partialRun.passed}/${partialRun.asked} vs ${flawless.passed}/${flawless.asked}`
  );
}

// ── The table ──────────────────────────────────────────────────────────

const crashed: ToolReliability = {
  name: "Example Indexer",
  toolUrl: "https://example.test",
  source: "RPC",
  sourceUrl: "https://rpc.test",
  runs: SCENARIOS.map((scenario) => ({
    scenario: scenario.id,
    checks: Object.fromEntries(
      scenario.checks.map((c) => [
        c.id,
        scenario.group === "crash-recovery" ? fail("exited when Postgres went away") : pass,
      ])
    ),
    measures:
      scenario.id === "db-restart"
        ? { "manual-restarts": 2, "resume-seconds": 41 }
        : scenario.id === "block-to-row"
          ? { "p50-ms": 640, "p99-ms": 4_200, "max-lag-blocks": 3 }
          : undefined,
  })),
};

const rows = [perfect("Perfect Indexer"), crashed].map((tool) => {
  const score = scoreTool(tool);
  return toReliabilityRow(score, measuresOf(score));
});
const table = buildReliabilityTable(rows);
console.log(`\n${table}\n`);

check("the headline restart count reaches the table", table.includes("2 restarts"), table);
check("the headline head lag reaches the table", table.includes("640ms"), table);
check(
  "a column the tool passed nothing in earns a numbered note",
  /\*\*\(1\)\*\* Example Indexer — passed no crash recovery check/.test(table),
  table
);
check(
  "cells read as passes over asks",
  table.includes("[0 / 10 · 2 restarts]") && table.includes("**25 / 35**"),
  table
);
check(
  "every score cell links to its own section",
  GROUPS.every((group) => table.includes(`#${group.id})`)),
  table
);
check(
  "the stronger tool sorts first",
  table.indexOf("Perfect Indexer") < table.indexOf("Example Indexer")
);

// ── Reading it back ────────────────────────────────────────────────────

const published = `# Results\n\n${RELIABILITY_START}\n${table}\n${RELIABILITY_END}\n`;
const parsed = parsePublishedReliability(published);
check("every published row is recovered", parsed.length === rows.length, String(parsed.length));
check(
  "rows are recovered by tool and source together",
  new Set(parsed.map(reliabilityRowKey)).size === rows.length
);
const recovered = parsed.find((row) => row.name === "Example Indexer")?.overall;
check(
  "the recovered overall matches what was published",
  recovered?.passed === 25 && recovered?.asked === 35,
  JSON.stringify(parsed.map((r) => [r.name, r.overall]))
);
check(
  "recovered cells keep their links",
  parsed.every((row) => GROUPS.every((group) => row.cells[group.id]?.includes(`#${group.id})`))),
  JSON.stringify(parsed[0]?.cells)
);
check(
  "note references are not carried into the next table",
  parsed.every((row) => !/\(\d/.test(row.overallCell)),
  JSON.stringify(parsed.map((r) => r.overallCell))
);

// A carried row re-renders without losing its numbers, which is the whole
// reason the parser exists.
const carried = buildReliabilityTable(parsed.map((row) => ({ ...row, carriedOver: true })));
check("a carried row is marked as stale", carried.includes("⚠️"), carried);
check("and keeps its published scores", carried.includes("640ms"), carried);

// ── The page a score links to ──────────────────────────────────────────
//
// The scenario page is generated from the same catalog the scores come from,
// which is only worth anything if the committed copy is the one the catalog
// currently produces. A stale page is a table of numbers pointing at
// explanations that are no longer true of them.
const { DOC_PATH, doc } = await import("./build-reliability-doc.ts");
const committed = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
check(
  "the committed scenario page matches the catalog",
  committed === doc,
  "run `node scripts/build-reliability-doc.ts` and commit the result"
);
check(
  "every group and scenario has an anchor on the page",
  [...GROUPS.map((g) => g.id), ...SCENARIOS.map((s) => s.id)].every((id) =>
    doc.includes(`<a id="${id}"></a>`)
  )
);

console.log(
  failures === 0 ? "\nAll reliability tests passed." : `\n${failures} failure(s).`
);
process.exit(failures === 0 ? 0 : 1);
