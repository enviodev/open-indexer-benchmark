// Killing the indexer at the worst moment, repeatedly.
//
// Processes get OOM-killed, evicted, and rolled during a deploy. None of that
// is supposed to cost data, and the guarantee that makes it safe is that
// progress is only ever committed together with the rows it accounts for. A
// tool that commits progress first loses whatever was in flight and never looks
// for it again; a tool that commits rows first re-processes them and duplicates
// them. Both look identical while running and only show up after a kill.
//
// So the kills are SIGKILL rather than SIGTERM — a graceful shutdown tests the
// shutdown path, not the recovery path — and they land at three different
// points: early in the backfill, late in the backfill, and at the head with the
// chain still moving. A separate graceful stop at the end checks the other
// half: that a tool asked politely to stop does not drop what it had buffered.

import { sleep } from "../../../cases/lib/process.ts";
import type { Check, Scenario, ScenarioOutcome } from "../harness.ts";
import { finalData, startTicker, worst } from "./helpers.ts";

const TOTAL_BLOCKS = 250;
const BLOCK_INTERVAL_MS = 2_000;

/** How long a restarted tool gets to write its next row. */
const RESUME_TIMEOUT_MS = 180_000;

export const restartRecovery: Scenario = {
  key: "restart-recovery",
  title: "Restart recovery",
  summary:
    "The indexer is SIGKILLed three times — early in the backfill, late in it, and at the " +
    "head — then stopped gracefully once. Checks that it resumes, and that the final data " +
    "has no gaps and no duplicates.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.append(TOTAL_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    const checks: Check[] = [];
    let worstResumeS = 0;
    let totalRewind = 0;

    /** Kill, restart, and measure what the crash cost. */
    async function cycle(name: string, signal: NodeJS.Signals): Promise<void> {
      const before = await ctx.progress();
      // The harness must not count this as a crash: it is the scenario's own
      // doing, and a restart it asked for is not a restart the tool needed.
      await ctx.halt(signal);

      // What survived on disk. A tool that commits rows ahead of progress shows
      // the same number here; one that buffers shows less, and will re-read the
      // difference.
      const onDisk = await ctx.progress();
      const rewind = Math.max(0, before - onDisk);
      totalRewind += rewind;

      const startedAt = Date.now();
      await ctx.start();
      const resumed = await ctx.waitForBlock(onDisk + 1, RESUME_TIMEOUT_MS);
      const seconds = (Date.now() - startedAt) / 1_000;
      worstResumeS = Math.max(worstResumeS, seconds);

      checks.push({
        name,
        status: resumed ? "pass" : "fail",
        detail: resumed
          ? `resumed after ${seconds.toFixed(1)}s` +
            (rewind > 0 ? `, re-reading ${rewind} block${rewind === 1 ? "" : "s"}` : "")
          : `did not write another row within ${RESUME_TIMEOUT_MS / 1_000}s of restarting`,
      });
      ctx.log(`  ${name}: ${checks[checks.length - 1].detail}`);
    }

    await ctx.start();

    // Early in the backfill: enough rows to have committed something, far
    // enough from the end that there is plenty left to get wrong.
    if (!(await ctx.waitForBlock(Math.floor(TOTAL_BLOCKS * 0.2), 300_000))) {
      return { status: "fail", detail: "never got far enough into the backfill to be killed" };
    }
    await cycle("kill early in backfill", "SIGKILL");

    if (!(await ctx.waitForBlock(Math.floor(TOTAL_BLOCKS * 0.7), 300_000))) {
      return {
        status: "fail",
        detail: "did not get back through the backfill after the first kill",
        checks,
      };
    }
    await cycle("kill late in backfill", "SIGKILL");

    if (!(await ctx.settle(300_000))) {
      return {
        status: "fail",
        detail: "did not reach the head after the second kill",
        checks,
      };
    }

    // At the head, with blocks still arriving while the process is dead — the
    // case where a tool has to notice it missed something rather than simply
    // carry on from where it stopped.
    const stopTicker = startTicker(ctx.chain, BLOCK_INTERVAL_MS);
    try {
      await sleep(4_000);
      await cycle("kill at the head", "SIGKILL");
      await ctx.settle(180_000);
      await sleep(4_000);
      await cycle("graceful stop", "SIGTERM");
      await ctx.settle(180_000);
    } finally {
      stopTicker();
    }

    ctx.metric("worst resume s", Number(worstResumeS.toFixed(1)));
    ctx.metric("blocks re-read", totalRewind);

    const data = await finalData(ctx, 120_000);
    if (data.status !== "pass") {
      checks.push({ name: "final data", status: "fail", detail: data.detail });
    }

    return {
      status: worst(checks),
      detail:
        data.status !== "pass"
          ? `restarted through every kill but ended with ${data.detail}`
          : checks.some((check) => check.status === "fail")
            ? (checks.find((check) => check.status === "fail")?.detail ?? "did not resume")
            : `resumed from every kill with no gaps or duplicates` +
              (totalRewind > 0 ? `, re-reading ${totalRewind} blocks in total` : ""),
      checks,
    };
  },
};
