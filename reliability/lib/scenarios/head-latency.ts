// How long after a block appears is its data queryable?
//
// Every indexer publishes a throughput number and almost none publish this one,
// yet it is the number an application actually feels: a user makes a trade and
// then looks at a page. Backfill speed says nothing about it. A tool that
// backfills at 70,000 events a second can still take eight seconds to show you
// the block that just landed, because at the head the cost is not throughput —
// it is the polling interval, the confirmation depth, and how long the write
// path waits before committing a batch.
//
// The measurement is deliberately blunt: the harness records the wall-clock
// moment each block became the chain head, then polls the database until rows
// for that block are readable. The gap between the two is what is reported. It
// includes the polling resolution below, which is why the figures are reported
// to a tenth of a second and not finer.

import { sleep } from "../../../cases/lib/process.ts";
import type { Scenario, ScenarioOutcome } from "../harness.ts";
import { finalData, percentile } from "./helpers.ts";

/** Blocks the tool backfills before the measurement starts. */
const WARMUP_BLOCKS = 150;

/** Wall-clock gap between the blocks produced during the measurement. */
const BLOCK_INTERVAL_MS = 2_000;

/** Blocks measured. Twenty at two seconds each is a forty-second observation. */
const MEASURED_BLOCKS = 20;

/** How often the database is asked what it can see. Bounds the resolution. */
const OBSERVE_MS = 100;

/** A block still not visible this long after it arrived is counted as lost. */
const GRACE_MS = 60_000;

export const headLatency: Scenario = {
  key: "head-latency",
  title: "Head latency",
  summary:
    "Time from a block reaching the chain head to its rows being readable in PostgreSQL, " +
    "measured over 20 blocks produced two seconds apart.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.append(WARMUP_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    await ctx.start();

    ctx.log(`Backfilling ${WARMUP_BLOCKS} blocks before measuring...`);
    if (!(await ctx.settle(300_000))) {
      return {
        status: "fail",
        detail: `did not catch up with ${WARMUP_BLOCKS} blocks within 300s, so head ` +
          `latency could not be measured`,
      };
    }
    ctx.log("At the head; measuring...");

    // Give the tool a moment to settle into its head-following loop, so the
    // first sample is not the tail of the backfill.
    await sleep(3_000);

    const seenAt = new Map<number, number>();
    let produced: number[] = [];
    let lastObserved = await ctx.progress();

    const deadline = Date.now() + MEASURED_BLOCKS * BLOCK_INTERVAL_MS + GRACE_MS;
    let nextBlockAt = Date.now();

    while (Date.now() < deadline) {
      if (produced.length < MEASURED_BLOCKS && Date.now() >= nextBlockAt) {
        const [block] = ctx.chain.append(1);
        produced.push(block.number);
        nextBlockAt += BLOCK_INTERVAL_MS;
      }

      const now = await ctx.progress();
      if (now > lastObserved) {
        const observedAt = Date.now();
        // Everything up to the new high-water mark became readable at the same
        // moment as far as this poll can tell, which is the honest reading: a
        // tool that commits five blocks in one transaction did make them all
        // visible at once.
        for (let block = lastObserved + 1; block <= now; block++) {
          if (!seenAt.has(block)) seenAt.set(block, observedAt);
        }
        lastObserved = now;
      }

      if (produced.length === MEASURED_BLOCKS && produced.every((b) => seenAt.has(b))) {
        break;
      }
      await sleep(OBSERVE_MS);
    }

    const latencies: number[] = [];
    const lost: number[] = [];
    for (const number of produced) {
      const observed = seenAt.get(number);
      const announced = ctx.chain.blockByNumber(number)?.announcedAt;
      if (observed === undefined || announced === undefined) {
        lost.push(number);
        continue;
      }
      latencies.push(observed - announced);
    }

    const toSeconds = (ms: number) => Number((ms / 1_000).toFixed(1));
    if (latencies.length > 0) {
      ctx.metric("p50 s", toSeconds(percentile(latencies, 50)));
      ctx.metric("p95 s", toSeconds(percentile(latencies, 95)));
      ctx.metric("max s", toSeconds(Math.max(...latencies)));
      ctx.metric("blocks measured", latencies.length);
    }

    const data = await finalData(ctx, 30_000);
    if (lost.length > 0) {
      return {
        status: "fail",
        detail:
          `${lost.length} of ${MEASURED_BLOCKS} head blocks were still not readable ` +
          `${GRACE_MS / 1_000}s after they were produced` +
          (data.detail ? `; ${data.detail}` : ""),
      };
    }
    if (data.status !== "pass") return { status: "fail", detail: data.detail };

    const p50 = toSeconds(percentile(latencies, 50));
    const p95 = toSeconds(percentile(latencies, 95));
    return {
      status: ctx.crashes.length > 0 ? "degraded" : "pass",
      detail: `median ${p50}s, p95 ${p95}s from block to readable row`,
    };
  },
};
