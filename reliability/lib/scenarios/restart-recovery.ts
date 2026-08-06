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
// shutdown path, not the recovery path — and they land at four points: after
// the first writes, twice inside a burst of new blocks the tool is still
// working through, and once at the head with the chain still moving. A graceful
// stop at the end checks the other half: that a tool asked politely to stop
// does not drop what it had buffered.
//
// How far behind a tool actually is when it is killed depends on how fast it
// is, and there is no fair way to hold every tool to the same lag. So the
// position at the moment of the kill is measured and published with the result
// rather than assumed: "killed at block 137 of 460" says what was tested, where
// "killed mid-backfill" only says what was intended.

import { sleep } from "../../../cases/lib/process.ts";
import type { Check, Scenario, ScenarioOutcome } from "../harness.ts";
import { finalData, startTicker, worst } from "./helpers.ts";

/** Blocks in place before the tool is started. */
const WARMUP_BLOCKS = 60;

/** Blocks released in one go, to be killed in the middle of. */
const BURST_BLOCKS = 400;

const BLOCK_INTERVAL_MS = 2_000;

/** How long a restarted tool gets to work through everything it missed. */
const RESUME_TIMEOUT_MS = 180_000;

export const restartRecovery: Scenario = {
  key: "restart-recovery",
  title: "Restart recovery",
  summary:
    "The indexer is SIGKILLed four times — after its first writes, twice during a burst of " +
    "400 new blocks, and once at the head — then stopped gracefully. Checks that it comes " +
    "back and catches up, and that the final data has no gaps and no duplicates.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.append(WARMUP_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    const checks: Check[] = [];
    let worstResumeS = 0;
    let totalRewind = 0;

    /** Kill, restart, and measure what the crash cost. */
    async function cycle(name: string, signal: NodeJS.Signals): Promise<void> {
      const before = await ctx.progress();
      const chainAt = ctx.chain.height;
      // The harness must not count this as a crash: it is the scenario's own
      // doing, and a restart it asked for is not a restart the tool needed.
      await ctx.halt(signal);

      // What survived on disk. A tool that commits rows ahead of progress shows
      // the same number here; one that buffers shows less, and will re-read the
      // difference.
      const onDisk = await ctx.progress();
      const rewind = Math.max(0, before - onDisk);
      totalRewind += rewind;

      // A few blocks arrive while it is down, so "did it resume" is a question
      // with an answer even for a tool that was already at the head. Without
      // them, a tool that never came back at all would satisfy the check simply
      // by having been finished before it was killed.
      ctx.chain.append(5);
      const target = ctx.chain.height;

      const startedAt = Date.now();
      await ctx.start();
      const resumed = await ctx.waitForBlock(target, RESUME_TIMEOUT_MS);
      const seconds = (Date.now() - startedAt) / 1_000;
      worstResumeS = Math.max(worstResumeS, seconds);

      const where = `killed at block ${before} of ${chainAt}`;
      checks.push({
        name,
        status: resumed ? "pass" : "fail",
        detail: resumed
          ? `${where}, back at the head after ${seconds.toFixed(1)}s` +
            (rewind > 0 ? `, re-reading ${rewind} block${rewind === 1 ? "" : "s"}` : "")
          : `${where}, then did not reach block ${target} within ` +
            `${RESUME_TIMEOUT_MS / 1_000}s of being restarted`,
      });
      ctx.log(`  ${name}: ${checks[checks.length - 1].detail}`);
    }

    await ctx.start();

    // Enough rows to have committed something, with plenty left to get wrong.
    if (!(await ctx.waitForBlock(Math.floor(WARMUP_BLOCKS / 3), 300_000))) {
      return { status: "fail", detail: "never wrote a row, so there was nothing to kill" };
    }
    await cycle("kill after first writes", "SIGKILL");

    // Two kills inside a burst the tool is still working through. How far it
    // gets before each one is its own speed, and is reported as such.
    for (const attempt of [1, 2]) {
      ctx.chain.append(BURST_BLOCKS);
      await sleep(attempt * 500);
      // Numbered: two checks sharing a name are two table rows nothing can
      // tell apart, and any lookup by name would only ever find the first.
      await cycle(`kill ${attempt} during a ${BURST_BLOCKS}-block burst`, "SIGKILL");
    }

    if (!(await ctx.settle(300_000))) {
      return {
        status: "fail",
        detail: "did not get through the burst after being restarted",
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
      await sleep(4_000);
      await cycle("graceful stop", "SIGTERM");
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
