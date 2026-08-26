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
import { GROUPS, SCENARIOS, scenarioPoints } from "../cases/lib/reliability/scenarios.ts";
import { measuresOf, scoreTool, type ToolReliability } from "../cases/lib/reliability/score.ts";
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
// Not arithmetic necessity — the scenario score is a share either way — but a
// convention worth pinning: a reader comparing two scenarios' checks should be
// able to read the points as percentages of that scenario without arithmetic.
check(
  "every scenario's checks add up to 100 points",
  SCENARIOS.every((s) => scenarioPoints(s) === 100),
  SCENARIOS.map((s) => `${s.id}=${scenarioPoints(s)}`).join(", ")
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

check("a tool that passes everything scores 100", scoreTool(perfect("Perfect")).overall === 100);

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
check(
  "a failed check costs exactly its points",
  half.groups.find((g) => g.group === "reorgs")?.score === 80,
  JSON.stringify(half.groups.find((g) => g.group === "reorgs")?.score)
);
check(
  "and moves the overall by its share of one group",
  half.overall === 96,
  String(half.overall)
);

const partial = perfect("Partial");
partial.runs = partial.runs.map((run) =>
  run.scenario === "reorg-cases"
    ? {
        ...run,
        checks: {
          ...run.checks,
          storm: { status: "partial", share: 0.5, detail: "two of three reorgs reconciled" },
        },
      }
    : run
);
check(
  "a partial check earns its share",
  scoreTool(partial).groups.find((g) => g.group === "reorgs")?.score === 92.5,
  String(scoreTool(partial).groups.find((g) => g.group === "reorgs")?.score)
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
check(
  "an unmeasured check does not cost points",
  scoreTool(skipped).groups.find((g) => g.group === "reorgs")?.score === 100
);

const unmeasured = scoreTool({
  ...perfect("Unmeasured"),
  runs: SCENARIOS.filter((s) => s.group !== "head-latency").map((scenario) => ({
    scenario: scenario.id,
    checks: Object.fromEntries(scenario.checks.map((c) => [c.id, pass])),
  })),
});
check(
  "a group nothing was measured in scores null, not zero",
  unmeasured.groups.find((g) => g.group === "head-latency")?.score === null
);
check(
  "and is left out of the overall rather than dragging it down",
  unmeasured.overall === 100,
  String(unmeasured.overall)
);

// Groups are averaged, not pooled: elaborating one group's checks must not
// change how much the others are worth.
const oneGroupGone = perfect("Lopsided");
oneGroupGone.runs = oneGroupGone.runs.map((run) =>
  run.scenario === "awkward-values"
    ? {
        ...run,
        checks: Object.fromEntries(
          SCENARIOS.find((s) => s.id === "awkward-values")!.checks.map((c) => [
            c.id,
            fail("stalled on the value"),
          ])
        ),
      }
    : run
);
check(
  "one failed group costs exactly one group's share of the overall",
  scoreTool(oneGroupGone).overall === 80,
  String(scoreTool(oneGroupGone).overall)
);

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
  "a zero column earns a numbered note",
  /\*\*\(1\)\*\* Example Indexer — failed every crash recovery check/.test(table),
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
check(
  "the recovered overall matches what was published",
  parsed.find((row) => row.name === "Example Indexer")?.overall === 80,
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
