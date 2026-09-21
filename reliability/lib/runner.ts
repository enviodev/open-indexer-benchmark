// Running the reliability suite: one tool at a time, every scenario, more than
// once each.
//
// The repeat is the part worth explaining. Every other number this repository
// publishes is a measurement, and a measurement is allowed to be noisy — the
// throughput runner takes the best of two windows and says so. A check is not
// a measurement. It is a claim that a tool does something, and a claim that
// holds two times in three is not a weaker claim, it is a different and worse
// one: an indexer that survives a database restart unless the restart lands
// mid-batch has not survived it, it has been lucky. Timing decides which of
// those a run sees, and timing is exactly what the harness cannot hold still.
//
// So each scenario runs `repeats` times against a fresh chain and a fresh
// database, and a check passes only if it passed every time. A check that
// failed once out of three is published as a failure, with the count in the
// note, because that is what an operator will meet.
//
// Measures go the other way: they are measurements, so the median across the
// runs is published and the spread is printed in the log. A tool whose median
// head latency is 600ms and whose worst run was 4s is not two tools.
//
// Everything a run needs is torn down between repeats, because half of these
// scenarios deliberately leave a tool or a database in a state the next one
// must not inherit.

import {
  DRIVERS,
  type Driver,
  type DriverFactory,
} from "../../cases/lib/drivers/index.ts";
import { psql, sleep } from "../../cases/lib/process.ts";
import {
  SELECTORS,
  encodeString,
  startChainMock,
  type ChainMock,
  type ChainSpec,
} from "./chain-mock.ts";
import { NO_END_BLOCK, RELIABILITY_CASE, baseChainSpec } from "./case.ts";
import { NoDatabaseContainer, restartDatabase } from "./db-control.ts";
import { ensureEnvioDb, needsEnvioDb } from "./envio-db.ts";
import { observer } from "./observe.ts";
import {
  DEFAULT_PATIENCE,
  EMPTY_RANGE,
  HUGE_INDEX_FROM,
  MAX_UINT,
  MAX_UINT_BLOCK,
  PLAYS,
  type Ctx,
  type Patience,
  type ScenarioResult,
} from "./play.ts";
import { SCENARIOS } from "./scenarios.ts";
import type { Outcome, ScenarioRun, ToolReliability } from "./score.ts";
import { presentation, runsHere, unaccountedDrivers, type ReliabilityTool } from "./tools.ts";

/** Poll interval for every wait the harness does. */
const POLL_MS = 500;

/**
 * How long one scenario may take before the harness stops waiting on it.
 *
 * Generous on purpose: the scenarios themselves impose the deadlines that
 * mean anything, and this one exists only so a tool that hangs cannot hold the
 * whole suite. A scenario stopped here reports its checks as unmeasured.
 */
const SCENARIO_TIMEOUT_MS = 25 * 60_000;

export interface RunOptions {
  tools: ReliabilityTool[];
  scenarios: string[];
  repeats: number;
  /** How long to wait for things. Published runs leave this alone. */
  patience?: Patience;
  /** Where each completed tool's result line is written. */
  emit?: (tool: ToolReliability) => void;
}

// ── The chain each scenario reads ──────────────────────────────────────

/**
 * The chain a scenario starts from.
 *
 * Every scenario gets the same ordinary chain except the one about values a
 * schema is likely to be wrong about, which gets a chain built out of them:
 * log indices near the 32-bit ceiling, a transfer of 2^256-1, five hundred
 * blocks carrying nothing, and a token whose name holds a byte Postgres will
 * not store. The constants are the scenario's own, imported rather than
 * repeated, so the chain and the checks cannot disagree about which block
 * carries what.
 */
function chainSpecFor(scenario: string): ChainSpec {
  const spec = baseChainSpec();
  if (scenario !== "awkward-values") return spec;
  return {
    ...spec,
    firstLogIndex: 0xffff_ffe2,
    // Only at the end of the chain, so an indexer that refuses them has
    // already been asked everything else the scenario wants to know.
    firstLogIndexFrom: HUGE_INDEX_FROM,
    emptyRange: EMPTY_RANGE,
    amountOf: (block) => (block === MAX_UINT_BLOCK ? MAX_UINT : null),
    calls: {
      ...spec.calls,
      // A name with a NUL in the middle. Legal in a Solidity string, and not
      // storable in a Postgres text column without being sanitised first.
      [SELECTORS.name]: encodeString(
        `Reliability${String.fromCharCode(0)}Token`
      ),
    },
  };
}

// ── One run of one scenario ────────────────────────────────────────────

/** Every check of a scenario, unmeasured, with one reason. */
function allUnmeasured(scenario: string, reason: string): ScenarioResult {
  const spec = SCENARIOS.find((s) => s.id === scenario);
  return {
    checks: Object.fromEntries(
      (spec?.checks ?? []).map((check) => [check.id, { status: "na", detail: reason }])
    ),
    measures: {},
  };
}

/**
 * One run of one scenario, against a driver the caller supplies.
 *
 * The driver and the way the database is restarted are parameters rather than
 * imports so that the harness can be run against something other than a real
 * indexer. That is not a convenience: scripts/test-reliability-harness.ts
 * drives every scenario against a deliberately broken indexer and asserts that
 * the checks catch it, which is the only way to know that a published pass
 * means anything. Both default to the real thing.
 */
export async function runOnce(
  tool: string,
  factory: DriverFactory,
  scenario: string,
  attempt: number,
  log: (message: string) => void,
  restartDb: typeof restartDatabase = restartDatabase,
  patience: Patience = DEFAULT_PATIENCE
): Promise<ScenarioResult> {
  const play = PLAYS[scenario];
  if (!play) return allUnmeasured(scenario, `no implementation for scenario "${scenario}"`);

  let chain: ChainMock | null = null;
  let driver: Driver | null = null;
  let restarts = 0;
  let launched = false;

  try {
    chain = await startChainMock(chainSpecFor(scenario));
    driver = factory({
      config: RELIABILITY_CASE,
      rpcUrl: chain.url,
      endBlock: NO_END_BLOCK,
    });
    const activeDriver = driver;
    const activeChain = chain;
    const sql = (query: string) => psql(activeDriver.dbUrl, query);
    const observe = observer(sql);

    log(`  preparing ${tool}...`);
    await activeDriver.prepare();

    const ctx: Ctx = {
      tool,
      chain: activeChain.control,
      driver: activeDriver,
      observe,
      log,
      patience,
      async launch() {
        await activeDriver.launch();
        launched = true;
        // The schema the tool is about to create is not the one the previous
        // launch left behind: several of these tools drop and recreate it on
        // start, and a cached resolution would outlive the tables it names.
        observe.reset();
      },
      async stopTool() {
        await activeDriver.stop();
      },
      async manualRestart(reason: string) {
        restarts++;
        log(`  restarting ${tool} by hand (${reason})`);
        await activeDriver.stop();
        await activeDriver.launch();
        observe.reset();
      },
      async signal(signal) {
        return (await activeDriver.signal?.(signal)) ?? false;
      },
      alive: () => launched && !activeDriver.exited(),
      restarts: () => restarts,
      progress: () => activeDriver.snapshot().catch(() => null),
      async waitFor(label, holds, timeoutMs) {
        const deadline = performance.now() + timeoutMs;
        let announced = false;
        while (performance.now() < deadline) {
          try {
            if (await holds()) return true;
          } catch {
            // The schema may not exist yet, or may have just been dropped by a
            // tool restarting. Neither is an answer to the question being
            // asked, so keep waiting rather than concluding anything.
          }
          if (!announced && performance.now() > deadline - timeoutMs / 2) {
            log(`  still waiting: ${label}`);
            announced = true;
          }
          await sleep(POLL_MS);
        }
        return false;
      },
      async restartDb(downMs: number) {
        const { container, downMs: actual } = await restartDb(activeDriver.dbUrl, downMs);
        log(`  stopped ${container} for ${(actual / 1_000).toFixed(1)}s`);
      },
    };

    const result = await withTimeout(
      play(ctx),
      SCENARIO_TIMEOUT_MS,
      `the scenario did not finish within ${SCENARIO_TIMEOUT_MS / 60_000} minutes`
    );
    // A scenario that returned early leaves its remaining checks unasked
    // rather than unmentioned: a missing check would silently shrink the
    // denominator, which flatters exactly the tool that made the scenario
    // give up.
    return withoutRefusedMethods(
      scenario,
      fillUnasked(scenario, result, "the scenario stopped before this was asked"),
      activeChain.control.stats().refused,
      log
    );
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    // A failure to set the run up is the harness's, not the tool's — with one
    // exception worth naming, since it is the difference between "this tool
    // has no reorg handling" and "nobody ran the scenario".
    log(`  ${tool}/${scenario} attempt ${attempt} could not run: ${message}`);
    return allUnmeasured(
      scenario,
      err instanceof NoDatabaseContainer
        ? `the tool's database is not in a container the harness can restart: ${message}`
        : `the run could not be set up: ${message}`
    );
  } finally {
    try {
      await driver?.stop();
    } catch {}
    try {
      await driver?.cleanup();
    } catch {}
    try {
      await chain?.close();
    } catch {}
  }
}

/**
 * Drop any failure from a scenario the chain could not fully serve.
 *
 * The generated chain implements the methods someone thought to write down. An
 * indexer reaching for one of the others gets an error back, fails to index,
 * and — without this — is published as a tool that cannot handle reorgs. That
 * would be the benchmark's own gap, reported as a finding about somebody
 * else's software, which is the one failure mode this whole repository exists
 * to avoid.
 *
 * So a refusal voids the failures: every failed check becomes unmeasured, and
 * says which method is missing. Checks that passed are left alone, because a
 * tool that coped is a tool that coped. The result is a dash in the table and
 * a named to-do against chain-mock.ts, rather than a score nobody can trust.
 */
function withoutRefusedMethods(
  scenario: string,
  result: ScenarioResult,
  refused: Record<string, number>,
  log: (message: string) => void
): ScenarioResult {
  const methods = Object.keys(refused);
  if (methods.length === 0) return result;

  const reason =
    `the generated chain does not serve ${methods.join(", ")}, which this tool ` +
    `asked for, so the scenario cannot say anything about it — ` +
    `add the method to reliability/lib/chain-mock.ts`;
  log(`  ! ${scenario}: refused ${methods.join(", ")}; failures are not the tool's`);

  const checks: Record<string, Outcome> = {};
  for (const [id, outcome] of Object.entries(result.checks)) {
    checks[id] = outcome.status === "fail" ? { status: "na", detail: reason } : outcome;
  }
  return { checks, measures: result.measures };
}

function fillUnasked(
  scenario: string,
  result: ScenarioResult,
  reason: string
): ScenarioResult {
  const spec = SCENARIOS.find((s) => s.id === scenario);
  const checks = { ...result.checks };
  for (const check of spec?.checks ?? []) {
    checks[check.id] ??= { status: "na", detail: reason };
  }
  return { checks, measures: result.measures };
}

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// ── Merging the repeats ────────────────────────────────────────────────

/**
 * One verdict from several runs of the same check.
 *
 * A failure anywhere is the verdict, and how often it happened is part of it:
 * "failed once in three" is a more useful sentence than either "failed" or
 * "passed", and it is the sentence that describes what an operator will meet.
 * Passing runs cannot outvote a failing one, because flakiness in a
 * reliability check is the finding rather than noise around it.
 */
export function mergeCheck(outcomes: Outcome[]): Outcome {
  const failures = outcomes.filter((o) => o.status === "fail");
  const asked = outcomes.filter((o) => o.status !== "na");
  if (asked.length === 0) {
    const first = outcomes.find((o) => o.status === "na");
    return first ?? { status: "na", detail: "not measured" };
  }
  if (failures.length === 0) return { status: "pass" };
  const detail = (failures[0] as { detail: string }).detail;
  return {
    status: "fail",
    detail:
      failures.length === asked.length
        ? detail
        : `${detail} (failed ${failures.length} of ${asked.length} runs)`,
  };
}

/** The median, which is the honest middle of a handful of noisy readings. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function mergeRuns(scenario: string, results: ScenarioResult[]): ScenarioRun {
  const spec = SCENARIOS.find((s) => s.id === scenario);
  const checks: Record<string, Outcome> = {};
  for (const check of spec?.checks ?? []) {
    checks[check.id] = mergeCheck(
      results.map(
        (result) =>
          result.checks[check.id] ?? { status: "na" as const, detail: "not measured" }
      )
    );
  }

  const measures: Record<string, number> = {};
  for (const measure of spec?.measures ?? []) {
    const values = results
      .map((result) => result.measures[measure.id])
      .filter((value): value is number => typeof value === "number");
    if (values.length > 0) measures[measure.id] = median(values);
  }
  return { scenario, checks, measures };
}

// ── The suite ──────────────────────────────────────────────────────────

export async function runReliability(options: RunOptions): Promise<ToolReliability[]> {
  const unaccounted = unaccountedDrivers();
  if (unaccounted.length > 0) {
    // A driver that is neither run nor explained would be absent from the
    // published table, which reads as a tool nobody thought to measure.
    throw new Error(
      `${unaccounted.join(", ")} is registered as an indexer but the reliability ` +
        `suite neither runs it nor says why — add it to RELIABILITY_TOOLS or to ` +
        `NOT_RUN in reliability/lib/tools.ts`
    );
  }

  const results: ToolReliability[] = [];
  for (const tool of options.tools) {
    if (!runsHere(tool)) {
      throw new Error(`${tool} does not read plain RPC, so the mock chain cannot drive it`);
    }
    const log = (message: string) => console.log(message);
    console.log(`\n=== ${presentation(tool).name} (${presentation(tool).source}) ===`);

    // HyperIndex connects to a Postgres it expects to find already running,
    // where every other tool starts its own.
    if (needsEnvioDb(tool)) await ensureEnvioDb(log);

    const runs: ScenarioRun[] = [];
    for (const scenario of options.scenarios) {
      const attempts: ScenarioResult[] = [];
      for (let attempt = 1; attempt <= options.repeats; attempt++) {
        console.log(`\n--- ${tool} / ${scenario} (run ${attempt} of ${options.repeats}) ---`);
        const startedAt = performance.now();
        attempts.push(
          await runOnce(
            tool,
            DRIVERS[tool],
            scenario,
            attempt,
            log,
            restartDatabase,
            options.patience ?? DEFAULT_PATIENCE
          )
        );
        console.log(
          `  run ${attempt} finished in ${((performance.now() - startedAt) / 1_000).toFixed(0)}s`
        );
      }
      const merged = mergeRuns(scenario, attempts);
      const passed = Object.values(merged.checks).filter((c) => c.status === "pass").length;
      const asked = Object.values(merged.checks).filter((c) => c.status !== "na").length;
      console.log(`  ${scenario}: ${passed} of ${asked} checks`);
      for (const [id, outcome] of Object.entries(merged.checks)) {
        if (outcome.status === "fail") console.log(`    ✗ ${id} — ${outcome.detail}`);
        if (outcome.status === "na") console.log(`    ? ${id} — ${outcome.detail}`);
      }
      // The spread across repeats is printed rather than published: the table
      // carries the median, and a reader chasing an odd one wants the runs.
      for (const measure of Object.keys(merged.measures ?? {})) {
        const values = attempts
          .map((a) => a.measures[measure])
          .filter((v): v is number => typeof v === "number");
        if (values.length > 1) console.log(`    ${measure}: ${values.join(", ")}`);
      }
      runs.push(merged);
    }

    const result: ToolReliability = { ...presentation(tool), runs };
    results.push(result);
    // One line per tool, in the shape the summary job parses — the same
    // contract the throughput jobs publish their results through.
    console.log(`RELIABILITY_RESULT ${JSON.stringify(result)}`);
    options.emit?.(result);
  }
  return results;
}

