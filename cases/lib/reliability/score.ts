// Turning what a reliability run observed into the numbers it publishes.
//
// A score is only worth printing if a reader can take it apart, so the whole
// scheme is deliberately small enough to state in a sentence: every check is
// worth the points the catalog gives it, a scenario is the share of its points
// earned, a group is the share of its scenarios' points earned, and the overall
// figure is the mean of the group scores. Nothing is normalised, curved, or
// weighted by anything the catalog does not say out loud.
//
// Groups are averaged rather than pooled on purpose. Pooling would make a
// column's influence depend on how many checks it happens to hold, so writing
// four new reorg checks would quietly demote crash recovery for every tool. The
// columns are meant to be five equal questions, and the arithmetic should say
// so rather than depend on how thoroughly each has been elaborated.
//
// A check may also be "n/a" — the run could not ask. It leaves both sides of
// the fraction rather than counting as a failure: a scenario that never ran is
// not evidence about the tool. A scenario with nothing but n/a has no score at
// all, and everything downstream renders it as a dash rather than as a zero,
// because "not measured" and "measured, scored nothing" are opposite findings
// and the table has to keep them apart.

import {
  GROUPS,
  SCENARIOS,
  scenarioPoints,
  scenariosIn,
  type Scenario,
} from "./scenarios.ts";

/**
 * What a run found for one check.
 *
 * `partial` exists for the checks that are a matter of degree — a tool that
 * reconciled five of six reorg cases — and carries the share earned. Anything
 * else is a pass, a failure, or a question the run could not put.
 */
export type Outcome =
  | { status: "pass" }
  | { status: "fail"; detail: string }
  | { status: "partial"; share: number; detail: string }
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

export interface ScenarioScore {
  scenario: string;
  /** 0-100, or null when nothing in it could be measured. */
  score: number | null;
  earned: number;
  possible: number;
  /** Checks that cost points, worst first, for the notes under the table. */
  failures: { label: string; detail: string; lost: number }[];
  /** Checks the run could not put, so the reader knows what is missing. */
  skipped: { label: string; detail: string }[];
  measures: Record<string, number>;
}

export interface GroupScore {
  group: string;
  score: number | null;
  scenarios: ScenarioScore[];
}

export interface ToolScore {
  name: string;
  toolUrl: string;
  source: string;
  sourceUrl: string;
  groups: GroupScore[];
  /** Mean of the groups that have a score, or null when none do. */
  overall: number | null;
}

const byId = new Map<string, Scenario>(SCENARIOS.map((s) => [s.id, s]));

function scoreScenario(scenario: Scenario, run: ScenarioRun | undefined): ScenarioScore {
  const failures: ScenarioScore["failures"] = [];
  const skipped: ScenarioScore["skipped"] = [];
  let earned = 0;
  let possible = 0;

  for (const check of scenario.checks) {
    const outcome = run?.checks[check.id] ?? {
      status: "na" as const,
      detail: "not measured",
    };
    if (outcome.status === "na") {
      skipped.push({ label: check.label, detail: outcome.detail });
      continue;
    }
    possible += check.points;
    if (outcome.status === "pass") {
      earned += check.points;
      continue;
    }
    const share = outcome.status === "partial" ? clamp01(outcome.share) : 0;
    earned += check.points * share;
    failures.push({
      label: check.label,
      detail: outcome.detail,
      lost: check.points * (1 - share),
    });
  }

  failures.sort((a, b) => b.lost - a.lost);
  return {
    scenario: scenario.id,
    score: possible > 0 ? round1((earned / possible) * 100) : null,
    earned: round1(earned),
    possible,
    failures,
    skipped,
    measures: run?.measures ?? {},
  };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function scoreTool(tool: ToolReliability): ToolScore {
  const runs = new Map(tool.runs.map((run) => [run.scenario, run]));
  // Unknown scenario ids are a catalog/runner mismatch, and silently ignoring
  // them would publish a score that quietly omits whatever the runner thought
  // it was measuring.
  for (const run of tool.runs) {
    const scenario = byId.get(run.scenario);
    if (!scenario) {
      throw new Error(`reliability run references unknown scenario "${run.scenario}"`);
    }
    // A check id that no longer exists is the same mistake one level down, and
    // the more likely one: a renamed check would otherwise drop out of the
    // score as an unmeasured question rather than as an error.
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
    const earned = scenarios.reduce((sum, s) => sum + s.earned, 0);
    const possible = scenarios.reduce((sum, s) => sum + s.possible, 0);
    return {
      group: group.id,
      score: possible > 0 ? round1((earned / possible) * 100) : null,
      scenarios,
    };
  });

  const scored = groups.map((g) => g.score).filter((s): s is number => s !== null);
  return {
    name: tool.name,
    toolUrl: tool.toolUrl,
    source: tool.source,
    sourceUrl: tool.sourceUrl,
    groups,
    overall: scored.length > 0 ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
  };
}

/**
 * Every measure a tool reported, by id. Measures are defined per scenario but
 * read per tool — the table's head lag column wants one number, not a walk
 * through the group tree — so this is the one place that flattening happens.
 */
export function measuresOf(score: ToolScore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of score.groups) {
    for (const scenario of group.scenarios) Object.assign(out, scenario.measures);
  }
  return out;
}

/** Total points a scenario could award, for the detail page's own arithmetic. */
export { scenarioPoints };
