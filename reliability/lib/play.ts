// What the harness does to an indexer, scenario by scenario.
//
// Each function here is one entry in the catalog, and returns one outcome per
// check that entry declares. The catalog says what is asked and what a pass
// means; this says how the question is put. They are meant to be read side by
// side, and scripts/test-reliability.ts fails if one of them grows a check the
// other does not have.
//
// Three rules the scenarios all follow.
//
// A check reports on the tool, never on the harness. Anything the scenario
// could not arrange - a database that is not in a container, a tool that never
// started - is "na" with the reason, so a run that could not ask a question
// says so instead of answering it badly.
//
// Nothing is concluded from a tool being slow. Every wait has a generous
// timeout and the check is on what is true when it expires, so a tool that
// needed ninety seconds to reconcile a reorg passes the reorg check and its
// ninety seconds show up in the measure beside it.
//
// The comparison is always against the chain as it stands now. Not against
// what it served earlier, and not against a recording of what the tool was
// sent: an indexer's job is to agree with the chain it is looking at, and
// after a reorg those are different claims.

import type { Driver, Snapshot } from "../../cases/lib/drivers/index.ts";
import { sleep } from "../../cases/lib/process.ts";
import type { ChainControl, ChainRow, Fault } from "./chain-mock.ts";
import { LOGS_PER_BLOCK, START_BLOCK } from "./case.ts";
import {
  balancesOf,
  diffBalances,
  diffRows,
  type Observer,
  type StoredRow,
} from "./observe.ts";
import type { Outcome } from "./score.ts";

// ── Timings ────────────────────────────────────────────────────────────

/**
 * How long a tool is given before a wait is called off.
 *
 * Both are deliberately generous: nothing here is a speed measurement, and a
 * tool that reconciles a reorg in ninety seconds passes the reorg check with
 * its ninety seconds recorded beside it.
 *
 * Carried on the context rather than read from the environment. An
 * environment variable that changes a published score is a quiet way to
 * publish a different benchmark under the same name; a parameter has to be
 * passed by whoever wanted it. The suite's own tests are the only thing that
 * passes anything else, because the indexer they drive answers in
 * milliseconds and waiting five minutes to conclude that a deliberate defect
 * is a defect would make them useless.
 */
export interface Patience {
  /** Catching up with the chain. */
  syncMs: number;
  /** Showing any sign of life after a shove. */
  reactMs: number;
}

/**
 * Three minutes was not enough for every tool on a shared CI runner: SubQuery
 * spends a minute on its own startup before the first block, and came back
 * unmeasured there while finishing comfortably on a laptop. Five is a deadline
 * for a tool that is not coming back, not a budget a working one should feel.
 */
export const DEFAULT_PATIENCE: Patience = { syncMs: 300_000, reactMs: 120_000 };

/**
 * How deep the deep reorg goes.
 *
 * Past the unfinalised window of Ponder, sixty-five blocks on mainnet, which
 * is the tool it was set for. Envio's window is 200 and graph-node's 250, so
 * for them it is one more rewrite they are expected to undo.
 */
const DEEP_REORG = 80;

/** How often a reorg's aftermath is re-read while it is still settling. */
const RECONCILE_POLL_MS = 500;
/** How long the database stays down when it is taken away. */
const DB_DOWN_MS = 10_000;
/**
 * How long the database is frozen rather than stopped.
 *
 * Longer than the stop, because the failure being staged is a wait rather
 * than an error: a tool whose statement timeout is thirty seconds has to be
 * given the chance to hit it, and one with no timeout at all has to be given
 * the chance to sit through the whole thing and prove it.
 */
const PAUSE_MS = 20_000;

/** The NUL the token's name carries, which Postgres will not store in text. */
const NUL = String.fromCharCode(0);

export interface ScenarioResult {
  checks: Record<string, Outcome>;
  measures: Record<string, number>;
}

/** What a scenario can do to the tool and the chain it reads. */
export interface Ctx {
  tool: string;
  chain: ChainControl;
  driver: Driver;
  observe: Observer;
  log(message: string): void;

  /** Start the indexer. The first call in every scenario. */
  launch(): Promise<void>;
  /** Stop it, without counting that against the tool. */
  stopTool(): Promise<void>;
  /**
   * Start it again after it gave up, counting one restart an operator would
   * have had to perform. The count is what the db-restart scenario publishes.
   */
  manualRestart(reason: string): Promise<void>;
  /** Send a signal straight to the indexer. False when the driver cannot. */
  signal(signal: NodeJS.Signals): Promise<boolean>;
  /** False once the indexer has exited on its own. */
  alive(): boolean;
  restarts(): number;

  /** How long this run waits for things. */
  patience: Patience;

  progress(): Promise<Snapshot | null>;
  /** Poll until the predicate holds. False on timeout - never throws. */
  waitFor(label: string, holds: () => Promise<boolean>, timeoutMs: number): Promise<boolean>;
  /** Restart the tool's database container. Throws when there is none. */
  restartDb(downMs: number): Promise<void>;
  /**
   * Freeze the tool's database container rather than stopping it, so its
   * connections stay open and nothing it sends is answered. Throws when there
   * is no container.
   */
  pauseDb(downMs: number): Promise<void>;
  /**
   * Have the tool's database record when each transaction committed. Called
   * before the tool starts, since it takes a restart. False when it could
   * not be arranged.
   */
  trackCommitTimes(): Promise<boolean>;
}

// ── Shared helpers ─────────────────────────────────────────────────────

const pass: Outcome = { status: "pass" };
const fail = (detail: string): Outcome => ({ status: "fail", detail });
const na = (detail: string): Outcome => ({ status: "na", detail });

/** A pass when the condition holds, and a failure carrying the reason when not. */
const verdict = (ok: boolean, detail: string): Outcome => (ok ? pass : fail(detail));

interface Comparison {
  missing: string[];
  wrong: string[];
  extra: string[];
  duplicates: number;
  balances: string[] | null;
  clean: boolean;
  summary: string;
}

/**
 * How the tool's tables compare with the chain, up to the head.
 *
 * Balances are compared as well as rows, and separately: a tool can hold every
 * transfer the chain holds and still have applied one of them twice, and that
 * is the failure the aggregate exists to catch.
 */
async function compare(ctx: Ctx, upTo?: number, from?: number): Promise<Comparison> {
  const head = upTo ?? ctx.chain.head();
  const chainRows = ctx.chain.rows(head);
  const stored = await ctx.observe.rows();
  const inWindow = <T extends { block: number }>(list: T[]) =>
    from === undefined ? list : list.filter((row) => row.block >= from);
  const rows = diffRows(inWindow(stored), inWindow(chainRows), head);
  // Balances add up the whole chain, so a comparison of a window cannot
  // include them: an account wrong because of a block outside it would read
  // as wrong because of one inside.
  const storedBalances = from === undefined ? await ctx.observe.balances() : null;
  const balances = storedBalances
    ? diffBalances(storedBalances, balancesOf(chainRows))
    : null;

  const clean =
    rows.missing.length === 0 &&
    rows.wrong.length === 0 &&
    rows.extra.length === 0 &&
    rows.duplicates === 0 &&
    (balances === null || balances.length === 0);

  const parts = [
    rows.missing.length > 0 ? `${rows.missing.length} missing` : "",
    rows.wrong.length > 0 ? `${rows.wrong.length} with the wrong amount` : "",
    rows.extra.length > 0 ? `${rows.extra.length} the chain does not have` : "",
    rows.duplicates > 0 ? `${rows.duplicates} stored twice` : "",
    balances && balances.length > 0 ? `${balances.length} balances wrong` : "",
  ].filter(Boolean);

  return {
    ...rows,
    balances,
    clean,
    summary: clean
      ? `matches the chain ${from === undefined ? "" : `from block ${from} `}at block ${head}`
      : `${parts.join(", ")} ${from === undefined ? "" : `from block ${from} `}at block ${head}` +
        (rows.wrong[0] ? ` (e.g. ${rows.wrong[0]})` : "") +
        (balances?.[0] ? ` (e.g. ${balances[0]})` : ""),
  };
}

/**
 * Wait until the tool holds every row the chain holds.
 *
 * The chain keeps producing while it waits, unless the caller is producing its
 * own blocks and needs the head left alone. See startHeartbeat.
 */
async function synced(
  ctx: Ctx,
  timeoutMs = ctx.patience.syncMs,
  {
    heartbeat = true,
    judge = () => compare(ctx),
  }: { heartbeat?: boolean | "live"; judge?: () => Promise<Comparison> } = {}
): Promise<boolean> {
  const beat =
    heartbeat === "live" ? startLiveChain(ctx) : heartbeat ? startHeartbeat(ctx) : null;
  try {
    return await ctx.waitFor(
      "catching up with the chain",
      async () => (await judge()).clean,
      timeoutMs
    );
  } finally {
    beat?.stop();
  }
}

/**
 * The tool's data against the chain, given a moment to agree.
 *
 * `synced` returns the instant a comparison came back clean - and the chain it
 * was comparing against has been moving the whole time, because these
 * scenarios keep a heartbeat running so the tools have a live head to follow.
 * By the time the next comparison runs, one or two more blocks exist and the
 * tool has not written them yet, so a verdict taken straight after a
 * successful sync reads as rows missing at the head.
 *
 * That is not a finding about an indexer, it is a race in the harness, and it
 * published one: an indexer that came back from a frozen database correctly
 * was marked down for two transfers it wrote a second later. So a verdict
 * waits for the first clean reading, and only a tool that never produces one
 * fails - which is the same rule the reorg cases have used all along.
 */
async function settled(
  ctx: Ctx,
  timeoutMs = ctx.patience.reactMs,
  judge = () => compare(ctx)
): Promise<Comparison> {
  let result = await judge();
  const deadline = performance.now() + timeoutMs;
  while (!result.clean && performance.now() < deadline) {
    await sleep(RECONCILE_POLL_MS);
    result = await judge();
  }
  return result;
}

/**
 * What a tool holds once it has been given every chance to finish.
 *
 * A tool that caught up is compared with the whole chain. One that did not is
 * compared up to the furthest block it wrote, the way a clean shutdown is:
 * above that is the part it never reached, and that is what "did not catch
 * up" or "did not recover" already says. Compared with the whole chain, a tool
 * that stopped indexing was also published as having lost data, and - because
 * the balances of the transfers it never read are wrong - as having counted
 * transfers twice. One stall, three findings.
 */
async function finalState(ctx: Ctx): Promise<{ caughtUp: boolean; result: Comparison }> {
  const caughtUp = await synced(ctx);
  if (caughtUp) return { caughtUp, result: await settled(ctx) };
  const horizon = await ctx.observe.highestBlock().catch(() => 0);
  const result = await compare(ctx, horizon);
  return {
    caughtUp,
    result: { ...result, summary: `${result.summary}, the furthest it got` },
  };
}

/**
 * Whether the tool holds something twice: a row, a row the chain does not
 * have, or balances that disagree with rows that are all correct. Balances
 * are wrong whenever a row is missing too, and that is a missing row, not a
 * transfer counted twice.
 */
function doubleCounted(result: Comparison): boolean {
  if (result.duplicates > 0 || result.extra.length > 0) return true;
  if (result.missing.length > 0 || result.wrong.length > 0) return false;
  return result.balances !== null && result.balances.length > 0;
}

/**
 * How many transfers the tool holds, as a baseline to measure progress from.
 *
 * Retried rather than read as zero on a failure, because zero is the one
 * baseline every tool clears: a count that could not be taken would pass a
 * tool that never wrote another row. Throws when the tables stay unreadable,
 * and the caller reports the check as not tested.
 */
async function rowsNow(ctx: Ctx): Promise<number> {
  const deadline = performance.now() + 30_000;
  for (;;) {
    try {
      return await ctx.observe.count();
    } catch (err) {
      if (performance.now() > deadline) {
        throw new Error(`the tool's tables could not be read: ${(err as Error).message}`);
      }
      await sleep(RECONCILE_POLL_MS);
    }
  }
}

/** Wait for the tool to hold at least this many transfers. */
async function reaches(ctx: Ctx, transfers: number, timeoutMs = ctx.patience.syncMs) {
  return ctx.waitFor(
    `indexing ${transfers} transfers`,
    async () => (await ctx.observe.count().catch(() => 0)) >= transfers,
    timeoutMs
  );
}

/** Produce blocks at a fixed interval, the way a live chain does. */
async function produce(ctx: Ctx, blocks: number, everyMs: number) {
  for (let i = 0; i < blocks; i++) {
    ctx.chain.advance(1);
    await sleep(everyMs);
  }
}

/** How many blocks a heartbeat will add, and how often. */
const HEARTBEAT_BLOCKS = 20;
const HEARTBEAT_EVERY_MS = 3_000;

/**
 * Keeps the chain moving while the harness waits for a tool to catch up.
 *
 * A real chain always produces blocks, and an indexer's realtime path is
 * written for that: it reacts to the head moving. A chain that has been
 * advanced and then stands still is not a chain any of these tools were
 * designed against, and one of them showed it - Ponder backfilled to its
 * finalised block, handed the last sixty-five to realtime, and realtime had no
 * new head to react to, so those blocks were never indexed and the scenario
 * read that as an indexer that could not keep up.
 *
 * Bounded rather than endless, because the blocks it adds are real: a scenario
 * that positions something at a particular height needs to know the head
 * cannot wander past it.
 */
function startHeartbeat(ctx: Ctx) {
  let added = 0;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped || added >= HEARTBEAT_BLOCKS) return;
    added++;
    ctx.chain.advance(1);
  }, HEARTBEAT_EVERY_MS);
  // Nothing should be kept alive by a heartbeat.
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/**
 * A chain that keeps producing a block every two seconds for as long as the
 * wait lasts, with no bound.
 *
 * For the scenarios that hand a tool a WebSocket. A tool following the head
 * by subscription learns of blocks only when one is announced, so the
 * bounded heartbeat - twenty blocks and done - leaves one that took longer
 * than a minute to backfill with nothing ever announced again: Ponder, which
 * spends a minute of its backfill retrying a token's empty symbol(), went
 * live on a chain that had gone still and waited there for good. Over HTTP it
 * would have polled and found the head; over a socket it is told, and a real
 * chain always has something to tell.
 */
function startLiveChain(ctx: Ctx) {
  const timer = setInterval(() => ctx.chain.advance(1), 2_000);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

/**
 * Bring the tool back if it has exited, so a later check in the same scenario
 * asks its question of a running indexer. Returns whether it had to.
 */
async function reviveIfNeeded(ctx: Ctx, reason: string): Promise<boolean> {
  if (ctx.alive()) return false;
  await ctx.manualRestart(reason);
  return true;
}

// ── Crash recovery ─────────────────────────────────────────────────────

export async function dbRestart(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};
  const measures: Record<string, number> = {};

  // Enough blocks that the tool is still working when the database is taken
  // away. This matters more than it looks: an indexer only meets a failed
  // query if it is issuing queries, and one that had already finished would
  // sit out the outage and pass a check it was never asked.
  ctx.chain.advance(900);
  await ctx.launch();
  if (!(await reaches(ctx, 400))) {
    return {
      checks: { "recovers-backfill": na("the tool indexed nothing to restart under") },
      measures,
    };
  }

  // ── Mid-backfill, with the chain still moving ──
  //
  // The chain keeps producing across the outage rather than standing still,
  // because an indexer only meets a failed query if it is issuing queries. A
  // tool that had caught up would sit the outage out and pass a check it was
  // never really asked - which is how an indexer that exits on its first
  // failed query was, at one point, scored as having survived one.
  const producingThrough = produce(ctx, 30, 500);
  try {
    await ctx.restartDb(DB_DOWN_MS);
  } catch (err) {
    await producingThrough;
    return { checks: { "recovers-backfill": na(String((err as Error).message)) }, measures };
  }
  await producingThrough;
  // Counted once the database is back, never before it went away: a batch
  // the tool commits in the moment before the stop would otherwise read as
  // the tool indexing again, and pass one that died with the database.
  let before: number;
  try {
    before = await rowsNow(ctx);
  } catch (err) {
    return { checks: { "recovers-backfill": na((err as Error).message) }, measures };
  }
  // There has to be work left for "it started indexing again" to mean
  // anything. A tool fast enough to have finished the four hundred blocks
  // before the database went away would otherwise be failed for having
  // nothing to do, which is the opposite of the finding.
  ctx.chain.advance(50);
  const backAt = performance.now();
  const movedOn = await ctx.waitFor(
    "indexing again after the database came back",
    async () => (await ctx.observe.count().catch(() => 0)) > before,
    ctx.patience.reactMs
  );
  measures["resume-seconds"] = Math.round((performance.now() - backAt) / 1_000);
  // A tool that exited is started again and asked the same question. Exiting
  // is a real cost and it is published - as "restarts needed", in the cell
  // beside this score - but it is not a second finding on top of whatever the
  // data turns out to be. What this check is for is the tool that never
  // indexes another row, with or without help; a tool that comes back and
  // gets the data right did recover, however ungracefully.
  const revived = await reviveIfNeeded(ctx, "exited when the database went away");
  const indexingAgain =
    movedOn ||
    (revived &&
      (await ctx.waitFor(
        "indexing again after being restarted by hand",
        async () => (await ctx.observe.count().catch(() => 0)) > before,
        ctx.patience.reactMs
      )));
  checks["recovers-backfill"] = verdict(
    indexingAgain,
    revived
      ? "exited when the database went away and indexed nothing after a restart"
      : `indexed nothing for ${Math.round(ctx.patience.reactMs / 1_000)}s after the ` +
        `database came back`
  );

  // ── At the head ──
  //
  // Asked only of a tool that came back from the first restart. One that is
  // still stuck from it cannot be at the head, and failing it here as well
  // publishes one stall as three findings.
  const notAsked = (outage: string) =>
    na(`it had not recovered from the ${outage}, so it was never asked this`);
  if (!indexingAgain) {
    checks["recovers-head"] = notAsked("restart during the backfill");
  } else {
    await synced(ctx);
    // The chain keeps producing across the second restart, so the tool has both
    // something to miss and something to come back to: forty seconds of it,
    // thirty of which fall after the database is back.
    const producing = produce(ctx, 20, 2_000);
    try {
      await ctx.restartDb(DB_DOWN_MS);
      const headBefore = await rowsNow(ctx);
      const followedOn = await ctx.waitFor(
        "indexing again at the head",
        async () => (await ctx.observe.count().catch(() => 0)) > headBefore,
        ctx.patience.reactMs
      );
      // Same rule as the backfill above: restarted by hand if it has to be, and
      // asked again.
      const restarted = await reviveIfNeeded(
        ctx,
        "exited when the database went away while tracking the head"
      );
      const following =
        followedOn ||
        (restarted &&
          (await ctx.waitFor(
            "following the head again after being restarted by hand",
            async () => (await ctx.observe.count().catch(() => 0)) > headBefore,
            ctx.patience.reactMs
          )));
      checks["recovers-head"] = verdict(
        following,
        restarted
          ? "exited at the head and stopped following the chain even after a restart"
          : "stopped following the head after the database came back"
      );
    } catch (err) {
      checks["recovers-head"] = na(String((err as Error).message));
    }
    await producing;
    await reviveIfNeeded(ctx, "exited during the second database restart");
  }

  // ── Frozen rather than stopped ──
  //
  // docker pause is SIGSTOP: the connections the tool holds stay open and
  // nothing it sends is ever answered. There is no error for a driver to see,
  // so a tool without a statement timeout waits in the silence indefinitely -
  // up, healthy by every external sign, and not indexing. Unlike the two
  // outages above, a restart is the finding rather than an acceptable cost:
  // nothing crashed, so nothing tells anybody to restart it.
  if (!indexingAgain) {
    checks["recovers-pause"] = notAsked("restart during the backfill");
  } else if (checks["recovers-head"]?.status === "fail") {
    checks["recovers-pause"] = notAsked("restart at the head");
  } else {
    const producingFrozen = produce(ctx, 20, 500);
    try {
      await ctx.pauseDb(PAUSE_MS);
      // The blocks produced during the freeze are all out by now, so the tool is
      // given more to do once it is unfrozen.
      const frozenBefore = await rowsNow(ctx);
      ctx.chain.advance(20);
      checks["recovers-pause"] = verdict(
        await ctx.waitFor(
          "indexing again after the database was unfrozen",
          async () => (await ctx.observe.count().catch(() => 0)) > frozenBefore,
          ctx.patience.reactMs
        ),
        ctx.alive()
          ? "waits for ever on a frozen database: no error, no exit, and no rows"
          : "exited while its database was frozen"
      );
    } catch (err) {
      checks["recovers-pause"] = na(String((err as Error).message));
    }
    await producingFrozen;
    await reviveIfNeeded(ctx, "exited while its database was frozen");
  }

  // ── What it holds once it is allowed to finish ──
  ctx.chain.advance(20);
  const { result } = await finalState(ctx);
  checks["no-loss"] = verdict(
    result.missing.length === 0 && result.wrong.length === 0,
    result.summary
  );
  checks["no-duplicates"] = verdict(!doubleCounted(result), result.summary);
  measures["manual-restarts"] = ctx.restarts();
  return { checks, measures };
}

export async function processKill(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};
  const measures: Record<string, number> = {};

  ctx.chain.advance(900);
  await ctx.launch();

  // Killed three times, at increasing depths into the range, because the
  // interesting kill is the one that lands while a batch is being committed
  // and no amount of looking from outside can tell when that is. Three tries
  // at unrelated moments is how the harness gets one, and a tool that only
  // loses data on the unlucky kill has still lost data.
  const stops = [200, 700, 1200];
  let torn: Comparison | null = null;
  let discarded = 0;

  for (const [attempt, transfers] of stops.entries()) {
    if (!(await reaches(ctx, transfers))) break;
    const highestBefore = await ctx.observe.highestBlock().catch(() => 0);
    if (!(await ctx.signal("SIGKILL"))) {
      return {
        checks: { resumes: na(`the ${ctx.tool} driver cannot signal its indexer directly`) },
        measures,
      };
    }
    // The process is gone; its rows are not. Whatever is readable right now is
    // what a reader querying the indexer during a crash would have seen, and
    // the first kill is the one that reading is taken from - later ones follow
    // a restart, so a mixture would say less.
    await sleep(1_000);
    if (attempt === 0) torn = await compare(ctx);

    const atKill = await ctx.observe.count().catch(() => 0);
    await ctx.manualRestart(`killed by the scenario (${transfers} transfers in)`);
    // Watched until it holds more than it did when it was killed, which is
    // the first moment it has provably written anything. The rows survive the
    // kill, so "any rows at all" is true before the new process has done a
    // thing - and a reading taken then would miss the rollback a tool does on
    // start. So the lowest height seen on the way is what the restart cost.
    let lowest = highestBefore;
    const writing = await ctx.waitFor(
      "writing again after the restart",
      async () => {
        const highest = await ctx.observe.highestBlock().catch(() => lowest);
        lowest = Math.min(lowest, highest);
        return (await ctx.observe.count().catch(() => 0)) > atKill;
      },
      ctx.patience.reactMs
    );
    discarded = Math.max(discarded, highestBefore - lowest);
    if (!writing) break;
  }

  if (!torn) {
    return {
      checks: { resumes: na("the tool indexed nothing to kill it mid-way") },
      measures,
    };
  }
  measures["reindexed-blocks"] = Math.max(0, discarded);
  checks["atomic-batch"] = verdict(
    torn.wrong.length === 0 && torn.duplicates === 0 && torn.extra.length === 0,
    `rows visible immediately after the kill are not all rows the chain holds: ${torn.summary}`
  );

  ctx.chain.advance(20);
  const { caughtUp, result } = await finalState(ctx);
  checks["resumes"] = verdict(
    caughtUp,
    ctx.alive()
      ? `did not catch up after being restarted: ${result.summary}`
      : "did not stay up after being restarted"
  );
  checks["no-gap"] = verdict(
    result.missing.length === 0,
    `${result.missing.length} transfers missing after the restarts, around block ` +
      `${result.missing[0]?.split(":")[0] ?? "?"}`
  );
  checks["no-double-apply"] = verdict(
    !doubleCounted(result),
    result.balances && result.balances.length > 0
      ? `${result.balances.length} balances wrong after the restarts (e.g. ${result.balances[0]})`
      : result.summary
  );
  return { checks, measures };
}

export async function gracefulShutdown(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};

  ctx.chain.advance(400);
  await ctx.launch();
  if (!(await reaches(ctx, 40))) {
    return { checks: { "exits-clean": na("the tool indexed nothing to stop") }, measures: {} };
  }

  const sent = await ctx.signal("SIGTERM");
  if (!sent) {
    return {
      checks: { "exits-clean": na(`the ${ctx.tool} driver cannot signal its indexer directly`) },
      measures: {},
    };
  }
  const exited = await ctx.waitFor("exiting on SIGTERM", async () => !ctx.alive(), 15_000);
  checks["exits-clean"] = verdict(
    exited,
    "still running fifteen seconds after SIGTERM, so its orchestrator would kill it"
  );

  // Whatever it wrote has to be consistent with the chain, whether it stopped
  // on the signal or had to be killed: the next start reads this state.
  //
  // Consistent up to where it got, which is not the end of the range. The
  // signal is sent a few dozen transfers in, on purpose, so most tools are
  // stopped halfway - and comparing against the whole chain read the half it
  // never reached as balances it had wrong. Every account in the unindexed
  // half "held 0" where the chain implied something, and whether a tool
  // passed came down to whether it had finished the range before the signal
  // landed: Envio Subgraph passed on a fast runner and failed on a slow one
  // with the same code, and Ponder, slower still, failed every time. None of
  // them had a wrong row, a duplicate or a torn balance anywhere.
  //
  // So the horizon is the last block the tool wrote a row for. Below it, a
  // missing row is a hole the next start will not come back for and a wrong
  // balance is a batch half-applied, and both are what this check is for.
  // Above it is only the part of the range it was stopped before.
  //
  // One reading, not a settled one: the tool has been stopped, nothing it
  // holds is going to change, and waiting for it to agree is two minutes of
  // asking a stopped process to do something.
  await ctx.stopTool();
  const horizon = await ctx.observe.highestBlock().catch(() => 0);
  if (horizon === 0) {
    checks["flushes"] = na("the tool wrote nothing before it was stopped");
    return { checks, measures: {} };
  }
  const result = await compare(ctx, horizon);
  checks["flushes"] = verdict(
    result.clean,
    `the state left behind does not match the chain up to block ${horizon}, ` +
      `the last one it wrote: ${result.summary}`
  );
  return { checks, measures: {} };
}

// ── Reorgs ─────────────────────────────────────────────────────────────

export async function reorgCases(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};
  const recoveries: number[] = [];

  /**
   * Whether the tool's data was already wrong going into the next case.
   *
   * Every case runs against the same database, one after another, so a
   * rewrite a tool never undid is still in its tables when the next one
   * lands. Judged against the whole chain, every later case then failed on
   * the first one's rows - one defect published as five - and waited out the
   * full patience twice over for a clean reading that could not come.
   */
  let alreadyWrong = false;

  /** Rewrite the chain, let it settle, and report whether the tool agrees. */
  async function reconciles(
    label: string,
    rewrite: () => { from: number },
    extend = 3
  ): Promise<Outcome> {
    const { from } = rewrite();
    if (extend > 0) ctx.chain.advance(extend);
    // A case that starts from wrong data is judged on the blocks it rewrote
    // and nothing else, which is the part of the damage it could have caused.
    const windowed = alreadyWrong;
    const judge = windowed ? () => compare(ctx, undefined, from) : () => compare(ctx);
    const startedAt = performance.now();
    await synced(ctx, ctx.patience.syncMs, { judge });

    // Agreeing about position is not agreeing about rows. A tool can report
    // the head while the rewrites it is making underneath are still being
    // committed, and the deeper the reorg the wider that window: sixty blocks
    // of rollback failed here once, with four balances mid-flight, which is a
    // tool being read too early rather than a tool that did not reconcile.
    //
    // So the comparison is given the same patience the rest of the scenario
    // has, and the first clean reading wins. A tool that never agrees still
    // fails, which is the thing being asked.
    const result = await settled(ctx, ctx.patience.reactMs, judge);

    // Timed to when the data agreed, not to when the position did, because
    // that is what "recovered from the reorg" means.
    if (result.clean) recoveries.push((performance.now() - startedAt) / 1_000);
    ctx.log(`  ${label}: ${result.summary}`);
    alreadyWrong = alreadyWrong ? !(await compare(ctx)).clean : !result.clean;
    return verdict(
      result.clean,
      !windowed
        ? result.summary
        : `${result.summary} (only the rewritten blocks were compared, because an ` +
            `earlier rewrite had already left the data wrong)`
    );
  }

  ctx.chain.advance(200);
  await ctx.launch();
  if (!(await synced(ctx))) {
    return {
      checks: { shallow: na("the tool never caught up, so there was nothing to reorg under it") },
      measures: {},
    };
  }

  checks["shallow"] = await reconciles("one-block reorg", () =>
    ctx.chain.reorg({ depth: 1, logs: "changed" })
  );
  checks["removes-event"] = await reconciles("reorg that drops the events", () =>
    ctx.chain.reorg({ depth: 3, logs: "dropped" })
  );

  // Six blocks replaced by three, so the chain is genuinely shorter than what
  // the tool has already stored and its head has to move backwards. Every
  // other reorg here can be handled by an indexer that only ever moves
  // forward, overwriting as it goes; this one cannot.
  checks["shortening"] = await reconciles(
    "six blocks replaced by three",
    () => ctx.chain.reorg({ depth: 6, extend: -3, logs: "changed" }),
    0
  );

  // A reorg the tool can only see by noticing that a block it already stored
  // is no longer on the chain, since it was not watching when it happened.
  await ctx.stopTool();
  const whileDown = ctx.chain.reorg({ depth: 5, logs: "changed" });
  await ctx.launch();
  checks["while-down"] = await reconciles("reorg while the indexer was down", () => whileDown);

  // Three rewrites inside the window a tool needs for one, so the second lands
  // while the first is still being unwound. They are deliberately not waited
  // on individually: the point is that they overlap whatever it is doing.
  const first = ctx.chain.reorg({ depth: 3, logs: "changed" });
  await sleep(4_000);
  const second = ctx.chain.reorg({ depth: 4, logs: "dropped" });
  await sleep(4_000);
  checks["storm"] = await reconciles("three reorgs in twelve seconds", () => {
    const third = ctx.chain.reorg({ depth: 2, logs: "changed" });
    return { from: Math.min(first.from, second.from, third.from) };
  });

  // A rewrite below the head, at a height the tool has already indexed but is
  // still working towards - the one a head-only reorg check walks past.
  //
  // Sixty blocks below the new head, and no further. Every tool has a window
  // it will unwind, configured or defaulted - Ponder's is 65 blocks on this
  // chain id, Envio's 200, graph-node's 250 - and a rewrite beyond it is one
  // the tool has been told to treat as final. This case once sat at 254, and
  // what it caught there was a setting, not a defect.
  checks["during-backfill"] = await reconciles(
    "reorg behind the head during a backfill",
    () => ctx.chain.reorg({ depth: 4, extend: 56, logs: "changed" }),
    0
  );

  const measures: Record<string, number> = {};
  if (recoveries.length > 0) {
    measures["reorg-recovery-seconds"] =
      Math.round((recoveries.reduce((a, b) => a + b, 0) / recoveries.length) * 10) / 10;
  }
  // Deeper than any tool's rollback window, and last for that reason.
  //
  // This is the one case a tool is allowed to answer by refusing: Ponder
  // stops with "unrecoverable reorg beyond finalized block" and is scored a
  // pass for it. What it leaves behind is a database holding rows the chain
  // no longer has, from blocks the tool had already called final, and a
  // restart resumes from the checkpoint rather than going back for them. That
  // is correct behaviour and it is also a database nothing else can be
  // measured in: run before the backfill case, it failed that one too, with
  // the same rows in the message. One event, scored once, at the end.
  //
  // Being unable to handle it is acceptable; carrying on as though nothing
  // happened is not.
  //
  // Eighty rather than the sixty this used to be, because sixty was not past
  // every window it claimed to be past: Ponder holds sixty-five blocks
  // unfinalised on mainnet, so a sixty-block rewrite is one it rolls back
  // like any other and the check was never put to it. The earlier revision of
  // this benchmark went ten blocks past the endpoint's declared finality and
  // found Ponder carrying on with a hundred and forty-eight rows from
  // orphaned blocks, which is the finding this depth exists to reach.
  const reachedBefore = await ctx.observe.highestBlock().catch(() => 0);
  const deep = await reconciles("eighty-block reorg", () =>
    ctx.chain.reorg({ depth: DEEP_REORG, logs: "changed" })
  );
  // Refusing does not have to mean exiting. Ponder and the Squid SDK both
  // stay up, log the reorg as unrecoverable on every block, and index
  // nothing more, which leaves the orphaned rows in place exactly as an exit
  // would. What separates that from carrying on is whether anything was
  // written on top of them, so a tool that never got past the head it had
  // before the rewrite stopped, whatever its process is doing.
  const reachedAfter = await ctx.observe.highestBlock().catch(() => Infinity);
  const halted = reachedAfter <= reachedBefore;
  if (deep.status === "pass") {
    checks["deep"] = deep;
  } else if (ctx.alive() && halted) {
    checks["deep"] = pass;
    ctx.log(
      `  ${DEEP_REORG}-block reorg: the indexer stopped indexing at block ${reachedAfter} ` +
        `rather than carry on`
    );
  } else if (!ctx.alive()) {
    // It stopped rather than going on with data it could not reconcile, which
    // is the honest answer to a reorg past what it can undo.
    checks["deep"] = pass;
    ctx.log(`  ${DEEP_REORG}-block reorg: the indexer stopped rather than carry on`);
    // Started again so the restart is counted and the run leaves nothing
    // half-dead, but not waited on: nothing is measured after this, and a
    // tool that has just refused a reorg it cannot undo will not reconcile
    // however long it is given.
    await ctx.manualRestart("stopped on a reorg deeper than its rollback window");
  } else {
    checks["deep"] = fail(
      `still running with data that does not match the chain after a ` +
        `${DEEP_REORG}-block reorg: ` +
        `${deep.status === "fail" ? deep.detail : ""}`
    );
    await ctx.stopTool();
    await ctx.launch();
  }

  return { checks, measures };
}

// ── RPC faults ─────────────────────────────────────────────────────────

export async function rpcOutage(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};
  const measures: Record<string, number> = {};

  ctx.chain.advance(600);
  await ctx.launch();
  if (!(await reaches(ctx, 60))) {
    return {
      checks: { survives: na("the tool indexed nothing before the faults began") },
      measures,
    };
  }

  // What the tool asks for when nothing is wrong, as a rate per second. The
  // back-off check is relative to this: an indexer that polls hard when
  // healthy is not hammering when it polls hard under a fault.
  ctx.chain.reset();
  await sleep(10_000);
  const healthyRate = ctx.chain.stats().requests / 10;

  const windows: { kind: "error" | "status" | "timeout"; status?: number; label: string }[] = [
    { kind: "error", label: "JSON-RPC errors" },
    { kind: "status", status: 429, label: "HTTP 429" },
    { kind: "status", status: 502, label: "HTTP 502" },
    { kind: "timeout", label: "requests that are never answered" },
  ];
  let peakRate = 0;
  for (const window of windows) {
    ctx.chain.reset();
    ctx.chain.fail({ kind: window.kind, status: window.status, message: window.label });
    await sleep(30_000);
    peakRate = Math.max(peakRate, ctx.chain.stats().requests / 30);
    ctx.chain.fail(null);
    ctx.log(`  ${window.label}: ${ctx.chain.stats().requests} requests in 30s`);
    if (!ctx.alive()) break;
  }

  checks["survives"] = verdict(ctx.alive(), "exited while the node was failing");
  checks["backs-off"] = verdict(
    peakRate <= Math.max(healthyRate * 20, 20),
    `asked ${peakRate.toFixed(1)} times a second while the node was failing, against ` +
      `${healthyRate.toFixed(1)} when it was healthy`
  );

  if (!ctx.alive()) {
    await ctx.manualRestart("exited while the node was failing");
    checks["resumes"] = fail("had to be restarted before it would index again");
  } else {
    const before = await ctx.observe.count().catch(() => 0);
    // Something to come back to. A tool that had caught up before the faults
    // began has nothing to index when they stop, and would be failed for
    // being finished.
    ctx.chain.advance(50);
    // Waiting the scenario's full patience rather than a short fixed window.
    // A tool backing off exponentially can take minutes to look again, and
    // cutting the wait short fails it for being slow rather than broken - how
    // slow is the measure below.
    const healedAt = performance.now();
    const movedOn = await ctx.waitFor(
      "indexing again once the node recovered",
      async () => (await ctx.observe.count().catch(() => 0)) > before,
      ctx.patience.reactMs
    );
    measures["resume-seconds"] = Math.round((performance.now() - healedAt) / 1_000);
    checks["resumes"] = verdict(
      movedOn,
      `indexed nothing for ${Math.round(ctx.patience.reactMs / 1_000)}s after the node recovered`
    );
  }

  ctx.chain.advance(20);
  const { result } = await finalState(ctx);
  checks["no-loss"] = verdict(
    result.missing.length === 0 && result.wrong.length === 0,
    `a failed request cost data: ${result.summary}`
  );
  return { checks, measures };
}

/**
 * Everything wrong at once, for the whole backfill, the way a bad provider is.
 *
 * The other RPC scenarios ask one clean question each: what does a tool do
 * when every request fails for thirty seconds, and does it come back. That is
 * a fair question and it is not the one that loses people data. A provider
 * having a bad hour does not fail every request and then stop - it fails some
 * of them, in several different ways, while the tool is in the middle of a
 * backfill, and the retry paths that work one at a time start interacting.
 * The earlier revision of this suite ran exactly this and found an indexer
 * finishing its range hundreds of rows short without ever exiting or
 * reporting an error, which none of the single-fault windows here noticed.
 *
 * The dice are seeded, so a run that finds something can be run again with
 * the same rolls.
 */
export async function rpcChaos(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};
  const measures: Record<string, number> = {};

  /** One in this many requests is broken, in one of the ways below. */
  const FAULT_RATE = 0.12;
  /** How long the endpoint misbehaves before it is left alone to be finished. */
  const CHAOS_MS = 120_000;
  /** How long each kind of fault holds the floor before the next takes over. */
  const TURN_MS = 10_000;

  const kinds: Fault[] = [
    { kind: "error", message: "internal error" },
    { kind: "status", status: 429, message: "rate limited" },
    { kind: "status", status: 502, message: "bad gateway" },
    { kind: "truncated" },
    { kind: "close" },
    { kind: "missing" },
    { kind: "timeout", methods: ["eth_getLogs"] },
  ];

  ctx.chain.advance(1_500);
  await ctx.launch();
  if (!(await reaches(ctx, 20))) {
    return {
      checks: { survives: na("the tool indexed nothing before the faults began") },
      measures,
    };
  }

  const startedAt = performance.now();
  let turn = 0;
  while (performance.now() - startedAt < CHAOS_MS && ctx.alive()) {
    const kind = kinds[turn % kinds.length];
    // A seed per turn, derived from the turn, so the whole sequence is one
    // reproducible run rather than seven independent ones.
    ctx.chain.fail({ ...kind, rate: FAULT_RATE, seed: 1_000 + turn });
    turn++;
    await sleep(TURN_MS);
    // The chain keeps moving underneath: a tool that stalls on a fault has
    // more to catch up on, which is what makes the stall visible later.
    ctx.chain.advance(20);
  }
  ctx.chain.fail(null);
  measures["faulted-requests"] = ctx.chain.stats().faulted;
  ctx.log(`  ${ctx.chain.stats().faulted} of ${ctx.chain.stats().requests} requests broken`);

  checks["survives"] = verdict(
    ctx.alive(),
    `exited while ${Math.round(FAULT_RATE * 100)}% of requests were failing`
  );
  await reviveIfNeeded(ctx, "exited while the endpoint was misbehaving");

  // Healthy again, and given the scenario's full patience to finish. What is
  // being asked is not whether it was fast under load; it is whether the
  // range it says it finished is the range the chain holds.
  ctx.chain.advance(20);
  const { caughtUp, result } = await finalState(ctx);
  checks["catches-up"] = verdict(
    caughtUp,
    `never caught up once the endpoint was healthy again: ${result.summary}`
  );
  checks["no-loss"] = verdict(
    result.missing.length === 0 && result.wrong.length === 0,
    `lost data under the faults: ${result.summary}`
  );
  checks["no-duplicates"] = verdict(
    !doubleCounted(result),
    `retries left rows behind twice over: ${result.summary}`
  );
  return { checks, measures };
}

export async function rpcLimits(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};

  // Caps a public endpoint really imposes, and neither is configured anywhere
  // the tool can see. The result cap is set below what a full range of blocks
  // would return, so narrowing the block range is not enough on its own.
  const MAX_RANGE = 1_000;
  const MAX_LOGS = 500;
  ctx.chain.setLimits({ maxBlockRange: MAX_RANGE, maxLogsPerResponse: MAX_LOGS });
  ctx.chain.advance(2_000);
  await ctx.launch();

  const finished = await synced(ctx);
  const { widestRange, capped } = ctx.chain.stats();
  // Two caps, two questions, and they have to be answered separately: one
  // "finished" verdict for both scored a tool that could not get past the
  // range cap as failing the result cap too, which it was never shown.
  //
  // The range cap is checked first, so a request refused for its result
  // count had already come in under the range cap - proof the tool narrowed
  // past it. Only a tool that did that has met the result cap at all. The
  // result cap trips at 500 logs, which is 250 blocks of this chain.
  const pastRangeCap = finished || capped.results > 0;
  checks["splits-range"] = verdict(
    pastRangeCap,
    `did not get through 2,000 blocks against an endpoint capping ranges at ` +
      `${MAX_RANGE}; widest range asked for was ${widestRange}`
  );
  checks["splits-results"] = finished
    ? pass
    : pastRangeCap
      ? fail(
          `did not get through a range whose responses were capped at ${MAX_LOGS} logs ` +
            `(${MAX_LOGS / LOGS_PER_BLOCK} blocks)`
        )
      : na(
          `it never got past the ${MAX_RANGE}-block range cap, so it never met the ` +
            `${MAX_LOGS}-log result cap`
        );

  return { checks, measures: {} };
}

export async function rpcInconsistency(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};

  ctx.chain.advance(200);
  await ctx.launch();
  if (!(await synced(ctx))) {
    return {
      checks: { "head-goes-backwards": na("the tool never caught up with the chain") },
      measures: {},
    };
  }

  // ── A replica answering from behind ──
  const before = await compare(ctx);
  ctx.chain.setHeadLag(30);
  await sleep(20_000);
  const during = await compare(ctx);
  ctx.chain.setHeadLag(0);
  ctx.chain.advance(10);
  const recovered = await synced(ctx);
  checks["head-goes-backwards"] = verdict(
    ctx.alive() && recovered && during.missing.length <= before.missing.length,
    !ctx.alive()
      ? "exited when the endpoint answered from behind"
      : !recovered
        ? "did not catch up again after the endpoint stopped lagging"
        : `discarded data it already had when the head moved backwards: ${during.summary}`
  );
  await reviveIfNeeded(ctx, "exited when the endpoint answered from behind");

  // ── The same logs served twice in one response ──
  ctx.chain.setDuplicateLogs(true);
  ctx.chain.advance(40);
  const sawDoubles = await synced(ctx);
  ctx.chain.setDuplicateLogs(false);
  const doubled = await compare(ctx);
  checks["duplicate-delivery"] = verdict(
    doubled.duplicates === 0 &&
      doubled.extra.length === 0 &&
      (doubled.balances === null || doubled.balances.length === 0),
    sawDoubles
      ? `wrote the duplicated logs: ${doubled.summary}`
      : `did not get through a range whose logs were served twice: ${doubled.summary}`
  );

  // ── A block the endpoint says is not there ──
  //
  // The logs are still served; only the block lookups come back null, which
  // is exactly what a load-balanced endpoint does when the head was announced
  // by one machine and asked of another a second behind it. A tool that takes
  // the null as "no such block" and moves on has a hole; one that takes it as
  // fatal is down for a condition that resolves itself.
  ctx.chain.advance(30);
  const beforePhantom = await ctx.observe.count().catch(() => 0);
  ctx.chain.fail({ kind: "missing", rate: 0.5, seed: 11 });
  await sleep(20_000);
  ctx.chain.fail(null);
  ctx.chain.advance(10);
  const pastPhantom = await synced(ctx);
  const phantom = await settled(ctx);
  checks["missing-block"] = verdict(
    ctx.alive() && pastPhantom && phantom.clean,
    !ctx.alive()
      ? "exited when the endpoint answered null for a block it has"
      : (await ctx.observe.count().catch(() => 0)) === beforePhantom
        ? "stopped indexing when the endpoint answered null for a block it has"
        : `lost data to a block the endpoint said was missing: ${phantom.summary}`
  );
  await reviveIfNeeded(ctx, "exited when a block came back null");

  // ── A hash that stops existing under a request ──
  ctx.chain.advance(20);
  ctx.chain.reorg({ depth: 6, logs: "changed" });
  ctx.chain.advance(10);
  const afterStale = await synced(ctx);
  const stale = await settled(ctx);
  checks["stale-hash"] = verdict(
    ctx.alive() && afterStale && stale.clean,
    !ctx.alive()
      ? "exited when a block hash it was using was reorged away"
      : `did not reconcile after a block hash stopped existing: ${stale.summary}`
  );
  return { checks, measures: {} };
}

/**
 * A block subscription that stops delivering without the socket closing.
 *
 * Only asked of a tool that subscribed: the scenario offers a WebSocket, and a
 * tool that never calls eth_subscribe polls, which has nothing to go quiet.
 */
export async function subscriptionStall(ctx: Ctx): Promise<ScenarioResult> {
  const BLOCK_MS = 2_000;
  /** Blocks produced with the subscription silent: a minute of chain. */
  const QUIET_BLOCKS = 30;

  ctx.chain.advance(100);
  await ctx.launch();
  if (!(await synced(ctx, ctx.patience.syncMs, { heartbeat: "live" }))) {
    return {
      checks: {
        "notices-quiet-subscription": na("the tool never caught up, so it was never at the head"),
      },
      measures: {},
    };
  }
  // A few live blocks, so a tool that subscribes once it reaches the head has
  // done so before anything is asked of it.
  await produce(ctx, 5, BLOCK_MS);
  if (ctx.chain.stats().subscriptions === 0) {
    return {
      checks: {
        "notices-quiet-subscription": na(
          "it never subscribed to new blocks, so it had no subscription to go quiet"
        ),
      },
      measures: {},
    };
  }
  await synced(ctx, ctx.patience.reactMs, { heartbeat: false });

  // Silent from here: the socket stays open and answers everything asked of
  // it, and no block is announced. The chain goes on for a minute, then holds
  // still, so there is a fixed head to reach - and nothing will ever announce
  // it.
  ctx.chain.setSubscriptionsQuiet(true);
  const quietAt = performance.now();
  const checks: Record<string, Outcome> = {};
  const measures: Record<string, number> = {};
  try {
    await produce(ctx, QUIET_BLOCKS, BLOCK_MS);
    const caughtUp = await synced(ctx, ctx.patience.reactMs, { heartbeat: false });
    const seconds = Math.round((performance.now() - quietAt) / 1_000);
    const reached = await ctx.observe.highestBlock().catch(() => 0);
    checks["notices-quiet-subscription"] = verdict(
      caughtUp,
      ctx.alive()
        ? `stopped following the chain once its subscription went quiet: at block ` +
            `${reached} of ${ctx.chain.head()} after ${seconds}s, with every request ` +
            `still being answered`
        : "exited when its subscription went quiet"
    );
    if (caughtUp) measures["stall-catch-up-seconds"] = seconds;
  } finally {
    ctx.chain.setSubscriptionsQuiet(false);
  }

  // ── Announcements back ──
  //
  // The next announcement names a head a minute past the last one the tool
  // heard of. Whatever it does with that, the minute in between has to be in
  // its tables.
  await reviveIfNeeded(ctx, "exited when its subscription went quiet");
  await produce(ctx, 5, BLOCK_MS);
  const { result } = await finalState(ctx);
  checks["fills-quiet-gap"] = verdict(
    result.missing.length === 0 && result.wrong.length === 0,
    `skipped blocks it was never told about: ${result.summary}`
  );
  return { checks, measures };
}

// ── Data fidelity ──────────────────────────────────────────────────────

/**
 * Where the awkward values sit on the chain.
 *
 * The order matters, and it is the one thing a real run changed about this
 * scenario. An indexer that refuses a log index above the signed 32-bit
 * maximum stops there - Ponder does, loudly - and when every block carried
 * one, that refusal was also the answer to every other question here, because
 * the tool never reached the blocks they were about. So the hostile indices
 * come last, after the values a tool should simply store, and the scenario
 * asks in two phases either side of them.
 */
export const MAX_UINT_BLOCK = START_BLOCK + 40;
export const EMPTY_RANGE = { from: START_BLOCK + 100, to: START_BLOCK + 599 };
export const HUGE_INDEX_FROM = START_BLOCK + 800;
export const MAX_UINT = (1n << 256n) - 1n;

export async function awkwardValues(ctx: Ctx): Promise<ScenarioResult> {
  const checks: Record<string, Outcome> = {};

  // ── Everything a tool should simply store ──
  //
  // Stopping short of the hostile indices by more than a heartbeat can add, so
  // the first phase cannot wander into the second. The gap also has to clear
  // whatever an indexer treats as unfinalised: Ponder holds sixty-five blocks
  // back on mainnet, and a progress marker that lags the head by that much
  // would otherwise read as a tool stuck inside the empty stretch.
  ctx.chain.advance(HUGE_INDEX_FROM - START_BLOCK - 1 - HEARTBEAT_BLOCKS - 5);
  await ctx.launch();
  const ordinary = await synced(ctx);

  const stored: StoredRow[] = await ctx.observe.rows().catch(() => []);
  const progress = await ctx.progress();
  const at = (progress?.blocks ?? 0) + START_BLOCK;

  /**
   * The furthest point there is any evidence the tool reached: its own
   * position, or the last block it wrote a row for, whichever is further.
   *
   * Rows count because for two of these tools the benchmark reads position
   * from the rows they wrote. The position can also be missing altogether - a
   * driver whose snapshot throws reports none - and reading that as "the tool
   * is at the start block" would state something about the tool that nobody
   * observed.
   */
  const furthest = stored.reduce((max, row) => Math.max(max, row.block), at);
  const noFurther = progress
    ? `has got no further than block ${furthest}`
    : `has got no further than block ${furthest}, and its own progress could not be read`;

  /**
   * A check about what a tool stored for a block is only a question once the
   * tool has been offered that block. Ask it of a tool that ran out of time
   * three hundred blocks earlier and the answer is always "stored nothing",
   * which is the harness's deadline published as a finding about somebody
   * else's software.
   */
  const wentPast = (block: number) => furthest > block;

  const atBlock = stored.find((row) => row.block === MAX_UINT_BLOCK);
  checks["max-uint"] = atBlock
    ? verdict(
        atBlock.amount === MAX_UINT,
        `stored ${atBlock.amount} for a transfer of 2^256-1`
      )
    : wentPast(MAX_UINT_BLOCK)
      ? verdict(false, `stored no transfer for block ${MAX_UINT_BLOCK}, which carried 2^256-1`)
      : na(
          `${noFurther}, so there is no saying whether it was ever shown a ` +
            `transfer of 2^256-1`
        );

  // Either the tool's own position has moved past the empty stretch, or it has
  // rows from beyond it. Both are proof it walked through.
  //
  // A tool that never arrived at the stretch at all is a different statement,
  // and not one this check makes: it is unmeasured rather than stuck. Arriving
  // means reaching the last block that carried logs before the stretch began.
  const arrived = wentPast(EMPTY_RANGE.from - 2);
  checks["empty-blocks"] = arrived
    ? verdict(
        wentPast(EMPTY_RANGE.to),
        `${noFurther}, so it is still inside the ` +
          `${EMPTY_RANGE.to - EMPTY_RANGE.from + 1} blocks that carried no logs`
      )
    : na(
        `${noFurther}, so it never arrived at the ` +
          `${EMPTY_RANGE.to - EMPTY_RANGE.from + 1} blocks that carried no logs`
      );

  // ── The values from the contract read ──
  const tokens = await ctx.observe.tokens().catch(() => null);
  if (tokens === null) {
    const missing = na("the project has no token table, so its metadata could not be read");
    checks["null-symbol"] = missing;
    checks["nul-byte"] = missing;
  } else if (tokens.length === 0) {
    // The table is there and the row is not. The name carries a NUL, which
    // Postgres refuses in a text column, so a tool that passes it through
    // unsanitised has its insert rejected - and the row never arriving is
    // exactly the failure this asks about. The symbol cannot be read from a
    // row that is not there, so that one is not tested.
    checks["null-symbol"] = na("the token row never arrived, so there is no symbol to read");
    checks["nul-byte"] = fail(
      "never stored the token row: its name carries a NUL byte, which Postgres refuses"
    );
  } else {
    const token = tokens[0];
    checks["null-symbol"] = verdict(
      token.symbol === null || token.symbol === "",
      `stored ${JSON.stringify(token.symbol)} for a symbol() that returned no data`
    );
    // The name carries a NUL, which Postgres will not accept in a text column.
    // Sanitising it is fine and so is storing nothing; what is not fine is the
    // row never arriving, or the indexer stalling behind it.
    checks["nul-byte"] = verdict(
      token.name === null || !token.name.includes(NUL),
      `stored a name still carrying a NUL byte: ${JSON.stringify(token.name)}`
    );
  }

  // ── The other event type ──
  //
  // Every project here is configured for two events, and the second one is
  // where a whole class of failure hides: a tool that indexes the event it
  // was written around and quietly ignores the other looks perfect in every
  // check above, because every check above reads transfers.
  // Only the events in blocks whose transfers the tool actually stored.
  //
  // "Went past the block" is not good enough, and the difference is not
  // theoretical: a tool running behind on a slow machine had stored transfers
  // up to one height with gaps below it, and counting every metadata event
  // under that height said it had dropped twelve events it had never been
  // shown. What the check means is the narrow thing - for a block you
  // indexed, did you store both of the events in it - so it asks only about
  // blocks the tool demonstrably read.
  const indexedBlocks = new Set(stored.map((row) => row.block));
  const owed = ctx.chain
    .metadataRows(furthest)
    .filter((row) => indexedBlocks.has(row.block));
  const held = await ctx.observe.metadataRows().catch(() => null);
  if (owed.length === 0) {
    // Two different absences, and they are not the same finding. A tool that
    // never reached a block carrying one of these events was not asked; a
    // tool that stored transfers but none in such a block has gaps, and the
    // checks about those gaps are the ones that say so.
    const everShown = ctx.chain.metadataRows(furthest).length > 0;
    checks["second-event"] = na(
      everShown
        ? `it stored no transfers in any of the ${
            ctx.chain.metadataRows(furthest).length
          } block(s) below ${furthest} that carried a metadata event, so there is ` +
          `nothing to say about whether it would have stored the event`
        : `${noFurther}, so it was never shown a metadata event`
    );
  } else if (held === null) {
    checks["second-event"] = fail(
      `stored the transfers in ${owed.length} block(s) that also carried a metadata ` +
        `event, and wrote no table for those events at all`
    );
  } else {
    const missing = owed.filter(
      (row) => !held.some((entry) => entry.block === row.block && entry.symbol === row.symbol)
    );
    checks["second-event"] = verdict(
      missing.length === 0,
      `stored the transfers in ${owed.length} block(s) that also carried a metadata ` +
        `event, and ${owed.length - missing.length} of those events`
    );
  }

  // ── And then the log indices near the 32-bit ceiling ──
  if (!ordinary) {
    checks["huge-log-index"] = na(
      "the tool had not caught up with the ordinary part of the chain, so it was " +
        "never shown a log index near the 32-bit ceiling"
    );
    return { checks, measures: {} };
  }

  ctx.chain.advance(60);
  const hugeIndex = ctx.chain
    .rows()
    .find((row) => row.logIndex > 2_147_483_647);
  if (!hugeIndex) {
    checks["huge-log-index"] = na("the chain served no log index above the 32-bit limit");
    return { checks, measures: {} };
  }

  const indexed = await ctx.waitFor(
    "indexing the blocks with log indices near the 32-bit ceiling",
    async () =>
      (await ctx.observe.rows().catch(() => [])).some(
        (row) => row.block === hugeIndex.block && row.logIndex === hugeIndex.logIndex
      ),
    ctx.patience.syncMs
  );
  checks["huge-log-index"] = verdict(
    indexed,
    ctx.alive()
      ? `did not store the transfer at log index ${hugeIndex.logIndex}`
      : `stopped when the chain served a log index of ${hugeIndex.logIndex}`
  );
  return { checks, measures: {} };
}

// ── Head latency ───────────────────────────────────────────────────────

export async function blockToRow(ctx: Ctx): Promise<ScenarioResult> {
  const BLOCK_MS = 2_000;
  const BLOCKS = 90;

  // Latency is read from the database's own commit times where it can be:
  // exact to the moment a row became readable, where a poll only brackets it
  // to within its interval - a quarter of a second, an eighth of the block
  // time this scenario is judged against.
  const exact = await ctx.trackCommitTimes();
  ctx.log(`  timing ${exact ? "from commit timestamps" : "by polling every 250ms"}`);

  ctx.chain.advance(100);
  await ctx.launch();
  // A live chain to catch up with, stopped before the timed window opens: the
  // window publishes its own blocks and times them, and a second source of
  // blocks during it would be measuring the harness.
  if (!(await synced(ctx, ctx.patience.syncMs, { heartbeat: "live" }))) {
    return {
      checks: {
        "median-under-block-time": na("the tool never caught up, so it was never at the head"),
      },
      measures: {},
    };
  }

  /**
   * Publish blocks and watch for their rows, sampling faster than the chain
   * produces so the reading is the tool's latency rather than the poll's.
   */
  async function watch(blocks: number, from: number) {
    const seen = { at: from, latencies: [] as number[], worstLag: 0, longestLagMs: 0 };
    /** Each block's latency as polling saw it, to be replaced by the exact one. */
    const sampled = new Map<number, number>();
    let lagSince: number | null = null;
    // The chain never pauses, the tail included: a tool on a subscription
    // takes a quiet chain for a dead feed, and the Squid SDK, told to reset
    // after ten seconds without a block, reset in the tail of this window and
    // crashed - a real bug, and the one subscription-stall exists to find,
    // but not this scenario's to report.
    const producing = produce(ctx, blocks + 5, BLOCK_MS);
    const until = performance.now() + (blocks + 5) * BLOCK_MS;
    let previousLook = Date.now();
    while (performance.now() < until) {
      await sleep(250);
      const look = Date.now();
      const highest = await ctx.observe.highestBlock().catch(() => 0);
      // A row seen now appeared at some point since the last look, and the
      // midpoint is the best guess polling has - a poor one: Ponder's rows,
      // which commit a steady 460ms after their block, read anywhere from
      // 270ms to 560ms this way, and low on the whole, because the query runs
      // a few tens of milliseconds after the moment it is timed from. Only
      // the fallback when the database cannot say when a row committed.
      const appearedAt = (previousLook + look) / 2;
      previousLook = look;
      while (seen.at < highest) {
        seen.at++;
        const block = ctx.chain.blockAt(seen.at);
        // Only blocks published during this window have a publication time;
        // the backfill's were all published before it started. A row cannot
        // appear before its block, so the midpoint is floored there.
        if (block?.publishedAtMs) {
          sampled.set(seen.at, Math.max(0, appearedAt - block.publishedAtMs));
        }
      }
      const lag = ctx.chain.head() - highest;
      seen.worstLag = Math.max(seen.worstLag, lag);
      if (lag > 5) lagSince ??= performance.now();
      else if (lagSince !== null) {
        seen.longestLagMs = Math.max(seen.longestLagMs, performance.now() - lagSince);
        lagSince = null;
      }
    }
    await producing;
    if (lagSince !== null) {
      seen.longestLagMs = Math.max(seen.longestLagMs, performance.now() - lagSince);
    }
    // The poll above decides which blocks arrived in the window and how far
    // behind the tool ran; when the database knows when each one committed,
    // that is the latency. A block it has no time for keeps the polled one.
    const committed = exact ? await ctx.observe.commitTimes(from) : null;
    let timed = 0;
    for (const [height, polled] of sampled) {
      const at = committed?.get(height);
      const publishedAt = ctx.chain.blockAt(height)?.publishedAtMs ?? 0;
      if (at !== undefined) timed++;
      seen.latencies.push(at !== undefined ? Math.max(0, at - publishedAt) : polled);
    }
    const median = (values: number[]) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
    ctx.log(
      `  ${timed} of ${sampled.size} blocks timed from commit timestamps; median ` +
        `${Math.round(median(seen.latencies))}ms, polling alone read ` +
        `${Math.round(median([...sampled.values()]))}ms`
    );
    return seen;
  }

  const run = await watch(BLOCKS, ctx.chain.head());
  if (run.latencies.length === 0) {
    return {
      checks: {
        "median-under-block-time": na(
          "no block published during the window reached the database"
        ),
      },
      measures: {},
    };
  }
  const sorted = [...run.latencies].sort((a, b) => a - b);
  const percentile = (share: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
  const p50 = percentile(0.5);
  const p99 = percentile(0.99);

  const checks: Record<string, Outcome> = {
    "median-under-block-time": verdict(
      p50 <= BLOCK_MS,
      `median latency was ${(p50 / 1_000).toFixed(1)}s, longer than the ` +
        `${BLOCK_MS / 1_000}s block time`
    ),
    "tail-bounded": verdict(
      p99 <= 10_000,
      `the slowest one percent took ${(p99 / 1_000).toFixed(1)}s`
    ),
    "keeps-up": verdict(
      run.longestLagMs <= 15_000,
      `ran more than five blocks behind the head for ` +
        `${(run.longestLagMs / 1_000).toFixed(0)}s`
    ),
  };

  // ── And the same again across a reorg ──
  // The new fork is one block longer, as a fork that wins is: most tools
  // notice a rewrite when the next block's parent is not the block they
  // stored, and a rewrite at the same height with nothing after it gives them
  // no next block. The chain goes on producing while the tool reconciles,
  // as a real one does: a tool on a subscription reads a still chain as a
  // dead feed. Every tool here has just shown it keeps up with a block every
  // two seconds, so a live chain asks nothing more of it than the rewrite.
  //
  // What it waits for is the tool writing past the new tip, not its data
  // agreeing with the chain. Whether the rewrite was undone is the reorgs
  // column's question; asked here too, a tool that never undoes one failed
  // this check for the same defect, and head latency stopped measuring speed.
  ctx.chain.reorg({ depth: 4, extend: 1, logs: "changed" });
  const newTip = ctx.chain.head();
  const live = startLiveChain(ctx);
  const reconciled = await ctx
    .waitFor(
      "writing past the rewrite",
      async () => (await ctx.observe.highestBlock().catch(() => 0)) >= newTip,
      60_000
    )
    .finally(() => live.stop());
  const after = await watch(15, ctx.chain.head());
  const afterSorted = [...after.latencies].sort((a, b) => a - b);
  const p50After = afterSorted[Math.floor(afterSorted.length / 2)];
  checks["recovers-after-reorg"] = !reconciled
    ? fail("had written nothing past the rewrite a minute later")
    : after.latencies.length === 0
      ? na("no block reached the database in the window after the reorg")
      : verdict(
          p50After <= Math.max(p50 * 2, BLOCK_MS),
          `median latency after the reorg was ${(p50After / 1_000).toFixed(1)}s, against ` +
            `${(p50 / 1_000).toFixed(1)}s before it`
        );

  return {
    checks,
    measures: {
      "p50-ms": Math.round(p50),
      "p99-ms": Math.round(p99),
      "max-lag-blocks": run.worstLag,
      subscribed: ctx.chain.stats().subscriptions > 0 ? 1 : 0,
    },
  };
}

// ── The catalog's other half ───────────────────────────────────────────

/**
 * Every scenario the catalog declares, and the function that runs it. The
 * suite's tests pin this against the catalog in both directions: a scenario
 * with no implementation would publish a column of dashes nobody could
 * explain, and an implementation with no catalog entry would score checks
 * nothing describes.
 */
export const PLAYS: Record<string, (ctx: Ctx) => Promise<ScenarioResult>> = {
  "db-restart": dbRestart,
  "process-kill": processKill,
  "graceful-shutdown": gracefulShutdown,
  "reorg-cases": reorgCases,
  "rpc-outage": rpcOutage,
  "rpc-limits": rpcLimits,
  "rpc-chaos": rpcChaos,
  "rpc-inconsistency": rpcInconsistency,
  "subscription-stall": subscriptionStall,
  "awkward-values": awkwardValues,
  "block-to-row": blockToRow,
};
