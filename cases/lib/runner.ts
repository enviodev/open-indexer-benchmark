// Shared benchmark runner.
//
// Every indexer goes through the same two phases:
//
//   Phase A (verification) — index a committed block range to completion, then
//     check the resulting database against the ground truth and measure how
//     much disk the indexed data occupies. Both metrics are only comparable
//     when every indexer holds exactly the same data, which is what a bounded
//     range guarantees and a fixed time window cannot.
//
//     The range is not guaranteed to be reachable: the run is capped at ten
//     minutes, and an indexer that has not finished by then is verified on what
//     it did index. That row reports a real check of real data over a known
//     fraction of the range, with the fraction named and its storage scaled to
//     what the whole range would have cost — a partial result rather than none.
//
//   Phase B (throughput) — only for indexers that finished phase A in under
//     the benchmark window. Wipe state and re-run with an end block just below
//     the chain head, stopping at whichever comes first: the window elapsing or
//     the end block being reached. The window is run more than once and the
//     best rate reported, because a single window on a shared CI runner is
//     noisy enough to reorder the middle of the table. Indexers too slow to
//     finish phase A in the window instead have their rate derived from phase
//     A, where the range and event count are known exactly.
//
// Stopping below the chain head keeps every indexer on the same footing: the
// fastest ones would otherwise catch up mid-window and spend the rest of it
// measuring head tracking rather than backfill.
//
// The drivers that start and observe each indexer live in ./drivers; this file
// is only the methodology.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchCaseLogs, type CaseConfig } from "./case.ts";
import type { Expected } from "./checksum.ts";
import {
  DRIVERS,
  INDEXERS,
  TOOLS,
  type Driver,
  type Snapshot,
} from "./drivers/index.ts";
import { fetchChainHeight } from "./hypersync.ts";
import { psql, sleep } from "./process.ts";
import { type BenchmarkResult, toTableRow } from "./result.ts";
import { startRpcMock, type RpcMock } from "./rpc-mock.ts";
import { buildTable, formatBytes, formatRate } from "./table.ts";
import { verify, type Verification } from "./verify.ts";

// ── Constants ──────────────────────────────────────────────────────────

/**
 * How far below the chain head the throughput run stops. Keeps the whole run
 * in the backfill path, clear of each indexer's unfinalised-block handling.
 */
const HEAD_OFFSET = 500;

/**
 * Stop the verification run after this long, whatever it has reached. Every
 * case gets the same five minutes: a range an indexer cannot finish inside it is
 * itself the finding, and the run is verified and rated from where it got to
 * rather than discarded — so a slow tool reports how much of the data it holds
 * instead of reporting nothing at all.
 */
const PHASE_A_TIMEOUT_S = 300;

/**
 * How many throughput windows to run for indexers fast enough to get one.
 * A single window is noticeably noisy on shared CI runners — repeat rates have
 * been seen to differ by ~30% — so the window is run more than once and the
 * best result is reported. Interference only ever slows a run down, so the
 * fastest of the samples is the one least polluted by it.
 */
const THROUGHPUT_RUNS = 2;

const DEFAULT_WINDOW_S = 100;

// ── Cleanup on unexpected exit ─────────────────────────────────────────

let activeDriver: Driver | null = null;
let activeMock: RpcMock | null = null;

async function cleanup() {
  const mock = activeMock;
  activeMock = null;
  if (activeDriver) {
    const driver = activeDriver;
    activeDriver = null;
    try {
      await driver.stop();
    } catch {}
    try {
      await driver.cleanup();
    } catch {}
  }
  // Closed after the indexer, which may still be mid-call: an endpoint that
  // disappears first turns an orderly shutdown into a page of connection
  // errors from a process that is already on its way out.
  try {
    await mock?.close();
  } catch {}
}

// ── Phase execution ────────────────────────────────────────────────────

interface PhaseOutcome {
  blocks: number;
  events: number;
  elapsedS: number;
  /** Reached the end block (or the expected event count) before running out of time. */
  completed: boolean;
}

/**
 * Run one phase to either completion or the time limit, whichever comes first.
 *
 * Progress is polled rather than sampled once at the end, because a phase can
 * finish early. Polling is slow (1s) until the indexer is close to the target,
 * then fast (200ms), which keeps the query overhead off the measurement while
 * still timing an early finish tightly.
 */
async function runPhase(
  driver: Driver,
  opts: {
    name: string;
    targetBlocks: number;
    targetEvents: number;
    maxSeconds: number;
  }
): Promise<PhaseOutcome> {
  const { targetBlocks, targetEvents, maxSeconds } = opts;

  await driver.launch();
  const startedAt = performance.now();
  const deadline = startedAt + maxSeconds * 1_000;

  let last: Snapshot = { blocks: 0, events: 0 };

  // Progress is read as an absolute position, so anything left over from a
  // previous phase would be counted as work done in this one. Every driver is
  // supposed to start from an empty database; say so loudly if one does not,
  // rather than silently reporting a rate for work it never did.
  try {
    const baseline = await driver.snapshot();
    if (baseline && (baseline.blocks > 0 || baseline.events > 0)) {
      console.log(
        `  Warning: ${opts.name} already reports ${baseline.blocks.toLocaleString(
          "en-US"
        )} blocks / ${baseline.events.toLocaleString("en-US")} events at launch — ` +
          `its database was not empty, so this run's rate is not trustworthy.`
      );
    }
  } catch {
    // Not queryable yet, which is the normal case for a clean start.
  }

  while (performance.now() < deadline) {
    // Exiting is a reason to stop waiting, not evidence of success: an indexer
    // that crashed on startup exits too. Completion is decided below, from the
    // progress actually recorded.
    if (
      last.blocks >= targetBlocks ||
      last.events >= targetEvents ||
      driver.exited()
    ) {
      break;
    }
    const remaining = Math.max(0, targetBlocks - last.blocks) / targetBlocks;
    await sleep(remaining < 0.05 ? 200 : 1_000);
    try {
      last = (await driver.snapshot()) ?? last;
    } catch {
      // Not queryable yet, or briefly unavailable — keep the previous reading.
    }
  }

  // Take the final reading and stamp the elapsed time from the same moment, so
  // the reported rate is internally consistent.
  //
  // Retried, unlike the readings during the run. A failure mid-run costs one
  // sample of many; a failure here is the whole measurement, and it decides
  // whether the phase counts as completed at all. It happens: the reading
  // spawns a psql process, and a run that ended with thousands of sockets open
  // has been seen to fail that spawn once and publish a finished range as
  // "indexed nothing".
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      last = (await driver.snapshot()) ?? last;
      break;
    } catch (err) {
      if (attempt === 3) {
        console.log(
          `  Warning: could not read final progress for ${opts.name} ` +
            `(${String((err as Error)?.message ?? err).split("\n")[0]}) — ` +
            `reporting the last reading taken during the run.`
        );
        break;
      }
      await sleep(500);
    }
  }
  const elapsedS = (performance.now() - startedAt) / 1_000;
  const completed = last.blocks >= targetBlocks || last.events >= targetEvents;

  return { blocks: last.blocks, events: last.events, elapsedS, completed };
}

// ── Benchmark ──────────────────────────────────────────────────────────

/**
 * What a run that stopped short of the end block covered.
 *
 * The share is measured in events rather than blocks: blocks are what the
 * indexer walked, events are what it was supposed to record, and it is the
 * records the checksum found missing that the report has to account for.
 *
 * `indexedShare` is 0 for a run that produced nothing at all, which is not the
 * same finding as a run that got part of the way — the tool did not index this
 * case, and nothing is extrapolated from it.
 */
function coverageOf(run: PhaseOutcome, expected: Expected) {
  const indexedShare =
    expected.totalEvents > 0 ? Math.min(1, run.events / expected.totalEvents) : 0;
  return {
    indexedShare,
    indexedNothing: run.blocks <= 0 && run.events <= 0,
  };
}

/**
 * Why a partial run is partial, and how much of the range it is missing. This
 * is the whole note under the results table: everything else verification says
 * about such a run — rows missing, entities short — follows from it, and reads
 * as a data bug without it.
 */
function describeShortfall(
  run: PhaseOutcome,
  expected: Expected,
  timeoutS: number
): string {
  const { indexedShare, indexedNothing } = coverageOf(run, expected);
  const timedOut = run.elapsedS >= timeoutS - 1;
  // No em-dash anywhere below: the published notes are parsed back on the
  // first one, which separates the tool name from its detail.
  if (indexedNothing) {
    return timedOut
      ? `indexed nothing in ${timeoutS}s, so there was no data to verify`
      : `indexed nothing before exiting after ${run.elapsedS.toFixed(0)}s, so there ` +
          `was no data to verify`;
  }
  const why = timedOut
    ? `the verification range was not finished within ${timeoutS}s`
    : `the indexer exited after ${run.elapsedS.toFixed(0)}s without finishing the ` +
      `verification range`;
  return `missing ${formatShare((1 - indexedShare) * 100)}% of the data: ${why}`;
}

/**
 * A percentage that never rounds away the thing it is reporting. An indexer
 * that recorded a thousand of two hundred thousand events is missing 99.5% of
 * them, and printing that as "100%" would say it recorded nothing; an indexer
 * short by a handful reads as "0%", which says it is short by nothing. Both
 * ends get a bound instead of a rounded figure.
 */
function formatShare(pct: number): string {
  if (pct <= 0 || pct >= 100) return pct <= 0 ? "0" : "100";
  const rounded = pct >= 10 ? pct.toFixed(0) : pct.toFixed(pct >= 1 ? 1 : 2);
  if (Number(rounded) === 0) return "<0.01";
  if (Number(rounded) === 100) return ">99";
  return rounded;
}

/**
 * Assemble a result from the parts that vary. Every exit reports the same
 * fourteen fields, and building them in one place means a new field cannot be
 * added to two of the three paths and forgotten in the third.
 */
function buildResult(
  key: string,
  verification: Verification,
  parts: {
    blocks: number;
    events: number;
    seconds: number;
    throughputSource: BenchmarkResult["throughputSource"];
    rangeSeconds: number | null;
    windowSeconds: number | null;
    windowRuns?: BenchmarkResult["windowRuns"];
  }
): BenchmarkResult {
  const { seconds } = parts;
  return {
    ...TOOLS[key],
    blocksPerSec: seconds > 0 ? parts.blocks / seconds : 0,
    eventsPerSec: seconds > 0 ? parts.events / seconds : 0,
    throughputSource: parts.throughputSource,
    correctness: verification.status,
    correctnessDetail: verification.detail,
    dbSizeBytes: verification.dbSizeBytes,
    dbTotalBytes: verification.dbTotalBytes,
    ...(verification.dbSizeEstimated ? { dbSizeEstimated: true } : {}),
    rangeSeconds: parts.rangeSeconds,
    windowSeconds: parts.windowSeconds,
    ...(parts.windowRuns ? { windowRuns: parts.windowRuns } : {}),
  };
}

/**
 * The row published for a tool the case declares unsupported. Every metric is
 * zero and `unsupported` is what the table actually renders from, but the row
 * is otherwise shaped exactly like one the tool would have produced had it run.
 * Nothing about the tool is started or constructed to build it.
 */
function unsupportedResult(key: string, reason: string): BenchmarkResult {
  return {
    ...TOOLS[key],
    blocksPerSec: 0,
    eventsPerSec: 0,
    throughputSource: "range",
    correctness: "unknown",
    correctnessDetail: reason,
    dbSizeBytes: null,
    dbTotalBytes: null,
    rangeSeconds: null,
    windowSeconds: null,
    unsupported: reason,
  };
}

/**
 * What the case's own endpoint served during the phase that just ended. Peak
 * concurrency is the number that explains a row: the endpoint imposes no limit
 * of its own, so it is how many calls the tool chose to have outstanding.
 */
function reportCalls(mock: RpcMock | null) {
  if (!mock) return;
  const { calls, rejected, peakInFlight } = mock.stats();
  if (calls === 0 && rejected === 0) return;
  console.log(
    `  Contract calls: ${calls.toLocaleString("en-US")} served, ` +
      `peak ${peakInFlight} in flight` +
      (rejected > 0
        ? ` — ${rejected.toLocaleString("en-US")} refused as outside the case`
        : "")
  );
}

async function benchmarkIndexer(
  key: string,
  config: CaseConfig,
  expected: Expected,
  rpcUrl: string,
  apiToken: string,
  windowS: number,
  headEndBlock: number,
  mock: RpcMock | null
): Promise<BenchmarkResult> {
  const factory = DRIVERS[key];
  const { name } = TOOLS[key];
  // Two different quantities that differ by one. The inclusive range holds
  // this many blocks, which is what the rate is computed over…
  const rangeBlocks = config.verifyEndBlock - config.startBlock + 1;
  // …while snapshots report `latestIndexedBlock - startBlock`, so reaching the
  // final block yields one less than that. Comparing progress against the
  // inclusive count would mean block-based completion could never fire, leaving
  // completion to hinge entirely on the event count matching exactly.
  //
  // The target is the last block that carries an event rather than the end
  // block itself, because half the drivers read progress from the rows the
  // indexer wrote — the highest block that produced one — and a range whose
  // final blocks hold nothing leaves them permanently short. Safe's factory
  // range ends seven blocks after its last ProxyCreation, which was enough to
  // publish a completed run as "exited without finishing the verification
  // range" and to downgrade what verification found to a note about the run
  // stopping short.
  const rangeTargetBlocks =
    (expected.lastEventBlock ?? config.verifyEndBlock) - config.startBlock;

  // ── Phase A: bounded verification run ──
  const phaseA = factory({ config, rpcUrl, endBlock: config.verifyEndBlock });
  activeDriver = phaseA;
  console.log(`\n--- ${name} — verification range ---\n`);
  console.log(
    `Indexing blocks ${config.startBlock.toLocaleString(
      "en-US"
    )}–${config.verifyEndBlock.toLocaleString("en-US")} ` +
      `(${expected.totalEvents.toLocaleString("en-US")} events expected)\n`
  );

  await phaseA.prepare();
  mock?.reset();
  const rangeRun = await runPhase(phaseA, {
    name,
    targetBlocks: rangeTargetBlocks,
    targetEvents: expected.totalEvents,
    maxSeconds: PHASE_A_TIMEOUT_S,
  });
  await phaseA.stop();
  reportCalls(mock);

  console.log(
    rangeRun.completed
      ? `\nIndexed the range in ${rangeRun.elapsedS.toFixed(1)}s — verifying...`
      : `\nStopped after ${rangeRun.elapsedS.toFixed(0)}s short of the end block ` +
          `— verifying what was indexed...`
  );
  let verification: Verification = await verify(
    (query) => psql(phaseA.dbUrl, query),
    config.entities,
    expected,
    // Rebuilding the ground-truth rows turns "the checksum differs" into
    // "512 of 1,747 balances hold the wrong value", which is worth a second
    // pass over HyperSync when a completed run disagrees. A run that stopped
    // early disagrees by construction — every entity is short — so the diff
    // would cost the same fetch to restate what the shortfall already says.
    rangeRun.completed
      ? {
          fetchExpectedRows: async () => {
            console.log("  Mismatch found — rebuilding ground truth to diff it...");
            const logs = await fetchCaseLogs(config, apiToken);
            return config.computeExpected(logs).entities;
          },
        }
      : {}
  );

  console.log(`  ${verification.status}: ${verification.detail}`);
  for (const entity of verification.entities) {
    for (const example of entity.examples) console.log(`    ${example}`);
  }

  if (!rangeRun.completed) {
    const { indexedShare, indexedNothing } = coverageOf(rangeRun, expected);
    // The rows that are there were still checked, so a partial run reports a
    // real verdict on real data — but it is a verdict on a fraction of the
    // range, and that fraction is the only thing worth publishing about it.
    // The per-entity breakdown stays in the log above: every entity is short
    // for the same reason, and a note listing all sixteen of them says no more
    // than one figure does.
    //
    // The verdict is "unknown" rather than a mismatch. The data is not wrong,
    // there is less of it, and marking the row ❌ would put a tool that ran out
    // of time in the same column as one that wrote the wrong values.
    //
    // Storage is scaled to what the full range would hold, from the share of
    // the events the run recorded, and flagged as the estimate it is. The
    // entities here are insert-only or one row per key, so the tables grow with
    // the events written; an indexer that indexed nothing gives nothing to
    // scale, and keeps a blank cell rather than an extrapolation from zero.
    const scale = indexedNothing || indexedShare <= 0 ? null : 1 / indexedShare;
    verification = {
      ...verification,
      status: "unknown",
      detail: describeShortfall(rangeRun, expected, PHASE_A_TIMEOUT_S),
      dbSizeBytes: scale && verification.dbSizeBytes ? verification.dbSizeBytes * scale : null,
      dbTotalBytes: scale && verification.dbTotalBytes ? verification.dbTotalBytes * scale : null,
      dbSizeEstimated: scale !== null,
    };
  }

  await phaseA.cleanup();
  activeDriver = null;

  // ── Phase B: throughput window ──
  // Only worth running when the indexer got through the verification range in
  // less than the window; otherwise phase A already measured its rate over a
  // range whose size and event count are known exactly.
  const runWindow = rangeRun.completed && rangeRun.elapsedS < windowS;

  if (!runWindow) {
    const seconds = rangeRun.elapsedS;
    const blocks = rangeRun.completed ? rangeBlocks : rangeRun.blocks;
    const events = rangeRun.completed ? expected.totalEvents : rangeRun.events;
    console.log(
      `\n${name}: slower than the ${windowS}s window over the ` +
        `verification range — reporting its rate from that run.\n`
    );
    return buildResult(key, verification, {
      blocks,
      events,
      seconds,
      throughputSource: "range",
      rangeSeconds: rangeRun.completed ? rangeRun.elapsedS : null,
      windowSeconds: null,
    });
  }

  const windowRuns: {
    eventsPerSec: number;
    blocksPerSec: number;
    seconds: number;
  }[] = [];

  for (let attempt = 1; attempt <= THROUGHPUT_RUNS; attempt++) {
    const phaseB = factory({ config, rpcUrl, endBlock: headEndBlock });
    activeDriver = phaseB;
    console.log(
      `\n--- ${name} — throughput (run ${attempt} of ${THROUGHPUT_RUNS}) ---\n`
    );
    console.log(
      `Running for up to ${windowS}s, stopping at block ${headEndBlock.toLocaleString(
        "en-US"
      )}\n`
    );

    await phaseB.prepare();
    mock?.reset();
    const windowRun = await runPhase(phaseB, {
      name,
      // Same allowance as phase A, and it matters for the same reason: a case
      // that pins its window to the verification range is one an indexer can
      // reach the end of, and then whether the run counts turns on whether the
      // range's last blocks happened to hold an event. A window that runs to
      // the chain head is nowhere near its target either way.
      targetBlocks:
        (headEndBlock === expected.endBlock
          ? (expected.lastEventBlock ?? headEndBlock)
          : headEndBlock) - config.startBlock,
      targetEvents: Number.POSITIVE_INFINITY,
      maxSeconds: windowS,
    });
    // Reaching the end block is a legitimate way for a run to finish — a case
    // may pin one close enough to get to — and that leaves `completed` set.
    // Exiting *without* it means the indexer died, and whatever partial work it
    // did is not a throughput measurement: keeping it risks publishing a rate
    // from a broken run.
    const died = phaseB.exited() && !windowRun.completed;
    await phaseB.stop();
    reportCalls(mock);
    await phaseB.cleanup();
    activeDriver = null;

    if (died) {
      console.log(
        `\nRun ${attempt}: the indexer exited after ${windowRun.elapsedS.toFixed(
          1
        )}s without reaching the end block — discarding this sample.\n`
      );
      continue;
    }

    // A window that recorded nothing is not a measurement of zero. An indexer
    // whose first batch is still in flight when the window closes has written
    // no rows yet, and phase A — which this tool finished, or it would not be
    // here — is a real measurement of the same work. Publishing the zero would
    // put a tool that indexed the range correctly at the bottom of the table
    // with a rate no run actually produced.
    if (windowRun.events === 0) {
      console.log(
        `\nRun ${attempt}: nothing had been written when the ${windowS}s window ` +
          `closed — discarding this sample.\n`
      );
      continue;
    }

    if (windowRun.completed) {
      console.log(
        `\nReached the end block after ${windowRun.elapsedS.toFixed(
          1
        )}s — rate computed over that time.`
      );
    }

    const seconds = windowRun.elapsedS;
    const run = {
      eventsPerSec: seconds > 0 ? windowRun.events / seconds : 0,
      blocksPerSec: seconds > 0 ? windowRun.blocks / seconds : 0,
      seconds,
    };
    windowRuns.push(run);
    console.log(
      `Run ${attempt}: ${formatRate(run.eventsPerSec)} events/s, ${formatRate(
        run.blocksPerSec
      )} blocks/s\n`
    );
  }

  // Every throughput run died. Phase A completed, so its rate is still sound —
  // fall back to it rather than reporting nothing or a rate from a broken run.
  if (windowRuns.length === 0) {
    console.log(
      `\n${name}: no throughput run survived — reporting the rate from the ` +
        `verification range instead.\n`
    );
    return buildResult(key, verification, {
      name,
      blocks: rangeBlocks,
      events: expected.totalEvents,
      seconds: rangeRun.elapsedS,
      throughputSource: "range",
      rangeSeconds: rangeRun.elapsedS,
      windowSeconds: null,
    });
  }

  // Report the best sample. Contention on a shared runner only ever costs
  // throughput, so the fastest run is the one least distorted by it.
  const rates = windowRuns.map((r) => r.eventsPerSec);
  const best = windowRuns.reduce((a, b) => (b.eventsPerSec > a.eventsPerSec ? b : a));
  // Counted over the runs that survived, not the runs attempted: a discarded
  // sample would otherwise be reported as one in perfect agreement.
  if (windowRuns.length > 1 && best.eventsPerSec > 0) {
    const spread = Math.max(...rates) - Math.min(...rates);
    console.log(
      `Spread across ${windowRuns.length} runs: ${(
        (spread / best.eventsPerSec) *
        100
      ).toFixed(1)}% of the best rate\n`
    );
  }

  return buildResult(key, verification, {
    name,
    blocks: best.blocksPerSec * best.seconds,
    events: best.eventsPerSec * best.seconds,
    seconds: best.seconds,
    throughputSource: "window",
    rangeSeconds: rangeRun.elapsedS,
    windowSeconds: best.seconds,
    windowRuns,
  });
}

// ── Entry point ────────────────────────────────────────────────────────

export async function runBenchmark(config: CaseConfig) {
  // Installed here rather than at module scope: importing this file should not
  // silently take over the process's signal handling, and result.ts exists as a
  // separate module partly so the CI summary job can avoid exactly that.
  const onSignal = (code: number) => async () => {
    await cleanup();
    process.exit(code);
  };
  process.on("SIGINT", onSignal(130));
  process.on("SIGTERM", onSignal(143));

  try {
    await run(config);
  } catch (err) {
    console.error("\nBenchmark failed:", err);
    await cleanup();
    process.exit(1);
  }
}

/** Seconds for the throughput window, from `--duration=<n>`. */
function parseWindowSeconds(): number {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  if (!flag) return DEFAULT_WINDOW_S;
  const value = Number(flag.slice("--duration=".length));
  // An unparseable duration used to become NaN, which silently made every
  // comparison against it false and downgraded the whole table to phase-A
  // rates. Refuse it instead.
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`Error: --duration must be a positive number of seconds.`);
    process.exit(1);
  }
  return value;
}

async function run(config: CaseConfig) {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const selected = positional.length > 0 ? positional : INDEXERS;

  for (const name of selected) {
    if (!DRIVERS[name]) {
      console.error(
        `Unknown benchmark "${name}". Available: ${INDEXERS.join(", ")}`
      );
      process.exit(1);
    }
  }

  const windowS = parseWindowSeconds();

  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("Error: ENVIO_API_TOKEN environment variable is required.");
    process.exit(1);
  }
  const upstreamRpcUrl = `https://1.rpc.hypersync.xyz/${apiToken}`;

  const expected: Expected = JSON.parse(
    readFileSync(resolve(config.dir, "expected.json"), "utf8")
  );
  if (expected.endBlock !== config.verifyEndBlock) {
    console.error(
      `expected.json covers blocks up to ${expected.endBlock} but the case verifies ` +
        `up to ${config.verifyEndBlock}. Regenerate it with scripts/generate-expected.ts.`
    );
    process.exit(1);
  }

  // The throughput window normally runs at the chain head, which is as far as
  // any indexer could get. A case that cares about *what* it is walking pins an
  // end block instead, and then the height is not needed at all.
  const headEndBlock =
    config.throughputEndBlock ?? (await fetchChainHeight(apiToken)) - HEAD_OFFSET;

  // A case whose handlers read contract state is pointed at an endpoint of the
  // benchmark's own, which answers those reads and relays everything else. One
  // endpoint serves the whole run: it holds no per-indexer state, and standing
  // it up per phase would only add ways for a port to still be in use.
  const mock = config.ethCall
    ? await startRpcMock(upstreamRpcUrl, config.ethCall)
    : null;
  activeMock = mock;
  const rpcUrl = mock?.url ?? upstreamRpcUrl;

  console.log(`=== ${config.title} Benchmark ===`);
  console.log(
    `Verification range: ${config.startBlock.toLocaleString(
      "en-US"
    )}–${config.verifyEndBlock.toLocaleString("en-US")} · ` +
      `throughput window: ${windowS}s up to block ${headEndBlock.toLocaleString("en-US")}`
  );
  if (config.ethCall) {
    console.log(
      `Contract calls are served by the benchmark at ${rpcUrl}: ` +
        `${config.ethCall.latencyMs}ms each, as many at once as it is given`
    );
  }
  console.log(`Running: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];
  for (const name of selected) {
    const reason = config.unsupported?.[name];
    if (reason) {
      // Published rather than skipped silently. A tool that cannot express the
      // case is a finding about the tool, and dropping its row would make that
      // finding indistinguishable from a job that crashed.
      const result = unsupportedResult(name, reason);
      results.push(result);
      console.log(`\n--- ${result.name} — not run ---\n  ${reason}\n`);
      console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`);
      continue;
    }

    const result = await benchmarkIndexer(
      name,
      config,
      expected,
      rpcUrl,
      apiToken,
      windowS,
      headEndBlock,
      mock
    );
    results.push(result);

    console.log(
      `\nSummary — ${result.name}: ${formatRate(
        result.eventsPerSec
      )} events/s, ${formatRate(result.blocksPerSec)} blocks/s, ` +
        `data ${result.correctness}, db ${formatBytes(result.dbSizeBytes)}\n`
    );
    // Machine-readable line consumed by the CI summary job.
    console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`);
    await sleep(3_000);
  }

  activeMock = null;
  await mock?.close();

  console.log(`\n=== Results ===\n`);
  console.log(buildTable(results.map(toTableRow)));
}
