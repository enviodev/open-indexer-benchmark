// Turning what a reliability run observed into the numbers it publishes.
//
// There is no scale here and no arithmetic worth the name. A check passed or
// it did not; a scenario is the passes over the asks; a column is the same sum
// across its scenarios; the overall figure is the same sum again across the
// whole suite. "23 of 35" is a number a reader can take apart, because the
// list it counts is on the page it links to.
//
// The alternative — points per check, scaled to a hundred — was tried first
// and thrown away. Weighting checks against each other means deciding, inside
// the code, that losing rows is worth one and a half times taking a minute to
// notice, and publishing that opinion as though it were a measurement. A
// reader cannot argue with 72. They can argue with "failed the deep reorg and
// the one where it happens while the indexer is down", which is what a count
// forces the table to say.
//
// What that costs is that every check has to be worth asking, since each one
// moves the number by the same amount, and that a column with more checks
// pulls harder on the overall than one with fewer. Both are stated on the page
// rather than corrected for: a correction would be the same buried opinion
// coming back in through another door.
//
// A check may also be "n/a" — the run could not ask. It leaves both sides of
// the fraction rather than counting as a failure: a question that was never
// put is not evidence about the tool. A scenario with nothing but n/a has no
// result at all, and everything downstream renders it as a dash rather than as
// "0 of 4", because "not measured" and "measured, passed nothing" are opposite
// findings and the table has to keep them apart.

import { GROUPS, SCENARIOS, checkCount, scenariosIn, type Scenario } from "./scenarios.ts";

/**
 * What a run found for one check.
 *
 * Deliberately three-valued. There is no "partial": a check that can come out
 * half true is two checks that have not been separated yet, and splitting it
 * is both more honest and more useful than scoring the middle.
 */
export type Outcome =
  | { status: "pass" }
  | { status: "fail"; detail: string }
  | { status: "na"; detail: string };

export interface ScenarioRun {
  scenario: string;
  /** Outcome per check id. A check with no entry is treated as not measured. */
  checks: Record<string, Outcome>;
  /** Measure id to published value, as the catalog's unit. */
  measures?: Record<string, number>;
}

/** Everything one tool did across the suite. */
export interface ToolReliability {
  /** Display name, matching the performance tables. */
  name: string;
  toolUrl: string;
  source: string;
  sourceUrl: string;
  runs: ScenarioRun[];
}

/** Passes over asks. `asked` excludes the checks the run could not put. */
export interface Tally {
  passed: number;
  asked: number;
}

export interface ScenarioScore extends Tally {
  scenario: string;
  /** Checks that failed, for the notes under the table. */
  failures: { label: string; detail: string }[];
  /** Checks the run could not put, so the reader knows what is missing. */
  skipped: { label: string; detail: string }[];
  measures: Record<string, number>;
}

export interface GroupScore extends Tally {
  group: string;
  scenarios: ScenarioScore[];
}

export interface ToolScore extends Tally {
  name: string;
  toolUrl: string;
  source: string;
  sourceUrl: string;
  groups: GroupScore[];
}

const byId = new Map<string, Scenario>(SCENARIOS.map((s) => [s.id, s]));

function scoreScenario(scenario: Scenario, run: ScenarioRun | undefined): ScenarioScore {
  const failures: ScenarioScore["failures"] = [];
  const skipped: ScenarioScore["skipped"] = [];
  let passed = 0;
  let asked = 0;

  for (const check of scenario.checks) {
    const outcome = run?.checks[check.id] ?? {
      status: "na" as const,
      detail: "not measured",
    };
    if (outcome.status === "na") {
      skipped.push({ label: check.label, detail: outcome.detail });
      continue;
    }
    asked++;
    if (outcome.status === "pass") passed++;
    else failures.push({ label: check.label, detail: outcome.detail });
  }

  return {
    scenario: scenario.id,
    passed,
    asked,
    failures,
    skipped,
    measures: run?.measures ?? {},
  };
}

const sum = (tallies: Tally[]): Tally => ({
  passed: tallies.reduce((n, t) => n + t.passed, 0),
  asked: tallies.reduce((n, t) => n + t.asked, 0),
});

export function scoreTool(tool: ToolReliability): ToolScore {
  const runs = new Map(tool.runs.map((run) => [run.scenario, run]));
  // An unknown scenario or check id is a catalog/runner mismatch. Ignoring one
  // would publish a count that quietly omits whatever the runner thought it
  // was measuring, and a renamed check would drop out as an unasked question
  // rather than as an error.
  for (const run of tool.runs) {
    const scenario = byId.get(run.scenario);
    if (!scenario) {
      throw new Error(`reliability run references unknown scenario "${run.scenario}"`);
    }
    for (const id of Object.keys(run.checks)) {
      if (!scenario.checks.some((check) => check.id === id)) {
        throw new Error(`scenario "${run.scenario}" has no check "${id}"`);
      }
    }
    for (const id of Object.keys(run.measures ?? {})) {
      if (!(scenario.measures ?? []).some((measure) => measure.id === id)) {
        throw new Error(`scenario "${run.scenario}" has no measure "${id}"`);
      }
    }
  }

  const groups: GroupScore[] = GROUPS.map((group) => {
    const scenarios = scenariosIn(group.id).map((scenario) =>
      scoreScenario(scenario, runs.get(scenario.id))
    );
    return { group: group.id, ...sum(scenarios), scenarios };
  });

  return {
    name: tool.name,
    toolUrl: tool.toolUrl,
    source: tool.source,
    sourceUrl: tool.sourceUrl,
    groups,
    ...sum(groups),
  };
}

/**
 * Every measure a tool reported, by id. Measures are defined per scenario but
 * read per tool — the table's head latency cell wants one number, not a walk
 * through the group tree — so this is the one place that flattening happens.
 */
export function measuresOf(score: ToolScore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of score.groups) {
    for (const scenario of group.scenarios) Object.assign(out, scenario.measures);
  }
  return out;
}

/**
 * How a tally sorts against another. Ratio first, so that a tool asked fewer
 * questions is not flattered by the ones it was spared; the raw pass count
 * breaks a tie, so a tool that answered more of them ranks above one that
 * answered the same share of fewer.
 */
export function tallyRank(tally: Tally): [number, number] {
  return [tally.asked > 0 ? tally.passed / tally.asked : -1, tally.passed];
}

export { checkCount };
