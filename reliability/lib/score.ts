// Turning what a reliability run observed into the numbers it publishes.
//
// There is no scale here and no arithmetic worth the name. A check passed or
// it did not; a scenario is the passes over the asks; a column is the same sum
// across its scenarios; the overall figure is the same sum again across the
// whole suite. "23 of 35" is a number a reader can take apart, because the
// list it counts is on the page it links to.
//
// The alternative - points per check, scaled to a hundred - was tried first
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
// A check may also be "n/a" - the run could not ask. It leaves both sides of
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
  failures: { label: string; failing: string; detail: string }[];
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
      detail: "not part of this run",
    };
    if (outcome.status === "na") {
      skipped.push({ label: check.label, detail: outcome.detail });
      continue;
    }
    asked++;
    if (outcome.status === "pass") passed++;
    else failures.push({
      label: check.label,
      failing: check.failing,
      detail: outcome.detail,
    });
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

/**
 * What a scenario the run never got to says for every check.
 *
 * The runner prints a tool's result after each scenario, with the ones still
 * to come listed as unmeasured for this reason, so a run cut short publishes
 * what it finished. Those placeholders are not results: a column holding
 * nothing else was not reported, and a real result for the same scenario from
 * elsewhere wins over one.
 */
export const NOT_REACHED = "the job ran out of time before this scenario";

/** Whether a scenario actually ran, rather than being a placeholder for one. */
export function reached(run: ScenarioRun): boolean {
  return Object.values(run.checks).some(
    (outcome) => outcome.status !== "na" || outcome.detail !== NOT_REACHED
  );
}

/**
 * One result per tool, from however many pieces measured it.
 *
 * CI measures every tool in one job, but a tool can still arrive in pieces - a
 * suite split up by hand, or a re-run uploaded beside the first. Scoring them
 * separately would publish a row per piece for one tool; scoring the
 * concatenation publishes the row the suite means. A scenario measured twice
 * keeps the first result rather than counting twice, which is what a re-run
 * would otherwise do to a denominator - unless the first is only a placeholder
 * for a scenario its run never reached.
 */
export function mergeToolResults(results: ToolReliability[]): ToolReliability[] {
  const merged = new Map<string, ToolReliability>();
  for (const result of results) {
    const key = `${result.name}|${result.source}`;
    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...result, runs: [...result.runs] });
      continue;
    }
    for (const run of result.runs) {
      const had = seen.runs.findIndex((prior) => prior.scenario === run.scenario);
      if (had === -1) seen.runs.push(run);
      else if (!reached(seen.runs[had]) && reached(run)) seen.runs[had] = run;
    }
  }
  return [...merged.values()];
}

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
 * read per tool - the table's head latency cell wants one number, not a walk
 * through the group tree - so this is the one place that flattening happens.
 */
export function measuresOf(score: ToolScore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of score.groups) {
    for (const scenario of group.scenarios) Object.assign(out, scenario.measures);
  }
  return out;
}

/**
 * How a tally sorts against another. Checks passed first, then the share.
 *
 * The share came first once, so that a tool asked fewer questions was not
 * flattered by the ones it was spared. It flattered them anyway, and worse: a
 * tool that answered four questions out of four sorted above one that answered
 * forty out of forty-three, which reads as a ranking of the tools and is a
 * ranking of how much each one was asked. Counting instead says what a reader
 * takes from the table anyway - this tool passed more of these checks than
 * that one - and the share still breaks a tie, so two tools with the same
 * count are separated by how much each was asked to earn it.
 *
 * A tool nothing was asked of sorts last rather than first, which is what the
 * -1 is for: no questions is not a perfect score.
 */
export function tallyRank(tally: Tally): [number, number] {
  return [tally.passed, tally.asked > 0 ? tally.passed / tally.asked : -1];
}

export { checkCount };
