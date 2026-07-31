// Shared benchmark runner.
//
// Every indexer goes through the same two phases:
//
//   Phase A (verification) — index a small committed block range to
//     completion, then check the resulting database against the ground truth
//     and measure how much disk the indexed data occupies. Both metrics are
//     only comparable when every indexer holds exactly the same data, which is
//     what a bounded range guarantees and a fixed time window cannot.
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
import { buildTable, formatBytes, formatRate } from "./table.ts";
import { verify, type Verification } from "./verify.ts";

// ── Constants ──────────────────────────────────────────────────────────

/**
 * How far below the chain head the throughput run stops. Keeps the whole run
 * in the backfill path, clear of each indexer's unfinalised-block handling.
 */
const HEAD_OFFSET = 500;

/**
 * Give up on the verification range after this long and report no result.
 * A case whose range is deliberately large can raise it via `phaseATimeoutS`.
 */
const DEFAULT_PHASE_A_TIMEOUT_S = 900;

/**
 * How many throughput windows to run for indexers fast enough to get one.
 * A single window is noticeably noisy on shared CI runners — repeat rates have
 * been seen to differ by ~30% — so the window is run more than once and the
 * best result is reported. Interference only ever slows a run down, so the
 * fastest of the samples is the one least polluted by it.
 */
const THROUGHPUT_RUNS = 2;

const DEFAULT_WINDOW_S = 60;

// ── Cleanup on unexpected exit ─────────────────────────────────────────

let activeDriver: Driver | null = null;

async function cleanup() {
  if (!activeDriver) return;
  const driver = activeDriver;
  activeDriver = null;
  try {
    await driver.stop();
  } catch {}
  try {
    await driver.cleanup();
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
  opts: { targetBlocks: number; targetEvents: number; maxSeconds: number }
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
        `  Warning: ${driver.name} already reports ${baseline.blocks.toLocaleString(
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
  try {
    last = (await driver.snapshot()) ?? last;
  } catch {}
  const elapsedS = (performance.now() - startedAt) / 1_000;
  const completed = last.blocks >= targetBlocks || last.events >= targetEvents;

  return { blocks: last.blocks, events: last.events, elapsedS, completed };
}

// ── Benchmark ──────────────────────────────────────────────────────────

/**
 * Assemble a result from the parts that vary. Every exit reports the same
 * fourteen fields, and building them in one place means a new field cannot be
 * added to two of the three paths and forgotten in the third.
 */
function buildResult(
  key: string,
  verification: Verification,
  parts: {
    name: string;
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
    name: parts.name,
    ...TOOLS[key],
    blocksPerSec: seconds > 0 ? parts.blocks / seconds : 0,
    eventsPerSec: seconds > 0 ? parts.events / seconds : 0,
    throughputSource: parts.throughputSource,
    correctness: verification.status,
    correctnessDetail: verification.detail,
    dbSizeBytes: verification.dbSizeBytes,
    dbTotalBytes: verification.dbTotalBytes,
    rangeSeconds: parts.rangeSeconds,
    windowSeconds: parts.windowSeconds,
    ...(parts.windowRuns ? { windowRuns: parts.windowRuns } : {}),
  };
}

/**
 * The row published for a tool the case declares unsupported. Every metric is
 * zero and `unsupported` is what the table actually renders from; the driver is
 * constructed only to borrow its display name, so the row reads identically to
 * one the tool would have produced had it run.
 */
function unsupportedResult(
  key: string,
  config: CaseConfig,
  rpcUrl: string,
  reason: string
): BenchmarkResult {
  const driver = DRIVERS[key]({ config, rpcUrl, endBlock: config.verifyEndBlock });
  return {
    name: driver.name,
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

async function benchmarkIndexer(
  key: string,
  config: CaseConfig,
  expected: Expected,
  rpcUrl: string,
  apiToken: string,
  windowS: number,
  headEndBlock: number
): Promise<BenchmarkResult> {
  const factory = DRIVERS[key];
  const phaseATimeoutS = config.phaseATimeoutS ?? DEFAULT_PHASE_A_TIMEOUT_S;
  // Two different quantities that differ by one. The inclusive range holds
  // this many blocks, which is what the rate is computed over…
  const rangeBlocks = config.verifyEndBlock - config.startBlock + 1;
  // …while snapshots report `latestIndexedBlock - startBlock`, so reaching the
  // final block yields one less than that. Comparing progress against the
  // inclusive count would mean block-based completion could never fire, leaving
  // completion to hinge entirely on the event count matching exactly.
  const rangeTargetBlocks = config.verifyEndBlock - config.startBlock;

  // ── Phase A: bounded verification run ──
  const phaseA = factory({ config, rpcUrl, endBlock: config.verifyEndBlock });
  activeDriver = phaseA;
  console.log(`\n--- ${phaseA.name} — verification range ---\n`);
  console.log(
    `Indexing blocks ${config.startBlock.toLocaleString(
      "en-US"
    )}–${config.verifyEndBlock.toLocaleString("en-US")} ` +
      `(${expected.totalEvents.toLocaleString("en-US")} events expected)\n`
  );

  await phaseA.prepare();
  const rangeRun = await runPhase(phaseA, {
    targetBlocks: rangeTargetBlocks,
    targetEvents: expected.totalEvents,
    maxSeconds: phaseATimeoutS,
  });
  await phaseA.stop();

  let verification: Verification;
  if (rangeRun.completed) {
    console.log(
      `\nIndexed the range in ${rangeRun.elapsedS.toFixed(1)}s — verifying...`
    );
    verification = await verify(
      (query) => psql(phaseA.dbUrl, query),
      config.entities,
      expected,
      {
        // Only reached when something mismatched: rebuild the expected rows so
        // the report can name what differs instead of just that a checksum did.
        fetchExpectedRows: async () => {
          console.log("  Mismatch found — rebuilding ground truth to diff it...");
          const logs = await fetchCaseLogs(config, apiToken);
          return config.computeExpected(logs).entities;
        },
      }
    );
    console.log(`  ${verification.status}: ${verification.detail}`);
    for (const entity of verification.entities) {
      for (const example of entity.examples) console.log(`    ${example}`);
    }
  } else {
    // Verifying a partial database would report missing rows, which reads as a
    // data bug rather than what it is: the indexer ran out of time.
    const timedOut = rangeRun.elapsedS >= phaseATimeoutS - 1;
    verification = {
      status: "unknown",
      detail: timedOut
        ? `did not finish the verification range within ${phaseATimeoutS}s`
        : `stopped after ${rangeRun.elapsedS.toFixed(0)}s having indexed ` +
          `${rangeRun.events.toLocaleString("en-US")} of ` +
          `${expected.totalEvents.toLocaleString("en-US")} events — ` +
          `the indexer exited before completing the range`,
      entities: [],
      dbSizeBytes: null,
      dbTotalBytes: null,
    };
    console.log(`\n  ${verification.detail}`);
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
      `\n${phaseA.name}: slower than the ${windowS}s window over the ` +
        `verification range — reporting its rate from that run.\n`
    );
    return buildResult(key, verification, {
      name: phaseA.name,
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
  let name = phaseA.name;

  for (let attempt = 1; attempt <= THROUGHPUT_RUNS; attempt++) {
    const phaseB = factory({ config, rpcUrl, endBlock: headEndBlock });
    activeDriver = phaseB;
    name = phaseB.name;
    console.log(
      `\n--- ${phaseB.name} — throughput (run ${attempt} of ${THROUGHPUT_RUNS}) ---\n`
    );
    console.log(
      `Running for up to ${windowS}s, stopping at block ${headEndBlock.toLocaleString(
        "en-US"
      )}\n`
    );

    await phaseB.prepare();
    const windowRun = await runPhase(phaseB, {
      targetBlocks: headEndBlock - config.startBlock,
      targetEvents: Number.POSITIVE_INFINITY,
      maxSeconds: windowS,
    });
    // The end block sits millions of blocks ahead, so nothing reaches it inside
    // the window: exiting without completing means the indexer died. Whatever
    // partial work it did is not a throughput measurement, and keeping it risks
    // publishing a rate from a broken run.
    const died = phaseB.exited() && !windowRun.completed;
    await phaseB.stop();
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
  const rpcUrl = `https://1.rpc.hypersync.xyz/${apiToken}`;

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

  const head = await fetchChainHeight(apiToken);
  const headEndBlock = head - HEAD_OFFSET;

  console.log(`=== ${config.title} Benchmark ===`);
  console.log(
    `Verification range: ${config.startBlock.toLocaleString(
      "en-US"
    )}–${config.verifyEndBlock.toLocaleString("en-US")} · ` +
      `throughput window: ${windowS}s up to block ${headEndBlock.toLocaleString("en-US")}`
  );
  console.log(`Running: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];
  for (const name of selected) {
    const reason = config.unsupported?.[name];
    if (reason) {
      // Published rather than skipped silently. A tool that cannot express the
      // case is a finding about the tool, and dropping its row would make that
      // finding indistinguishable from a job that crashed.
      const result = unsupportedResult(name, config, rpcUrl, reason);
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
      headEndBlock
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

  console.log(`\n=== Results ===\n`);
  console.log(buildTable(results.map(toTableRow)));
}
