// What happens when PostgreSQL goes away and comes back.
//
// This is the most ordinary failure there is. Databases get restarted for
// upgrades, failed over, evicted by an orchestrator, and paused by a noisy
// neighbour holding a lock. None of that is exotic, and an indexer is expected
// to survive all of it without losing a row.
//
// Three shapes, because tools fail differently under each:
//
//   stop  — a clean shutdown. Connections are closed, and a client that handles
//           errors at all sees a definite one.
//   kill  — SIGKILL. PostgreSQL replays its WAL on the way back, and any
//           transaction in flight is gone whether or not the client noticed.
//   pause — SIGSTOP. Connections stay open and stop answering, so a tool
//           without timeouts hangs rather than erroring. This is the one that
//           finds tools whose retry logic never gets a chance to run.
//
// The chain keeps advancing throughout. Recovery is not "did it reconnect", it
// is "did it get back to the head with exactly the right rows".

import { sleep } from "../../../cases/lib/process.ts";
import type { OutageKind } from "../postgres.ts";
import type { Check, Scenario, ScenarioOutcome } from "../harness.ts";
import { finalData, startTicker, worst } from "./helpers.ts";

const WARMUP_BLOCKS = 150;
const BLOCK_INTERVAL_MS = 2_000;

const OUTAGES: { kind: OutageKind; seconds: number }[] = [
  { kind: "stop", seconds: 6 },
  { kind: "kill", seconds: 6 },
  { kind: "pause", seconds: 10 },
  { kind: "kill", seconds: 15 },
];

/** How long a tool gets to be back at the head after the database returns. */
const RECOVERY_TIMEOUT_MS = 120_000;

export const dbOutage: Scenario = {
  key: "db-outage",
  title: "Database outage",
  summary:
    "PostgreSQL is stopped, SIGKILLed and paused under the running indexer while the chain " +
    "keeps producing blocks. Counts the restarts the tool needed and the time it took to " +
    "get back to the head with correct data.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.append(WARMUP_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    await ctx.start();
    if (!(await ctx.settle(300_000))) {
      return {
        status: "fail",
        detail: `did not reach the head within 300s, so the outages were never applied`,
      };
    }

    const stopTicker = startTicker(ctx.chain, BLOCK_INTERVAL_MS);
    const checks: Check[] = [];
    let worstRecoveryS = 0;
    /**
     * The outage currently applied, so it is undone however this block exits.
     * A database left stopped or SIGSTOPped would fail every scenario that ran
     * after it in the same process, and each of those would be reported as an
     * unmeasurable run rather than as this scenario's failure.
     */
    let applied: OutageKind | null = null;

    try {
      for (const [index, outage] of OUTAGES.entries()) {
        const name = `${outage.kind} ${outage.seconds}s`;
        const crashesBefore = ctx.crashes.length;
        const progressBefore = await ctx.progress();

        ctx.log(`Outage ${index + 1}/${OUTAGES.length}: ${outage.kind} for ${outage.seconds}s`);
        applied = outage.kind;
        await ctx.db.outage(outage.kind);
        await sleep(outage.seconds * 1_000);
        await ctx.db.restore(outage.kind);
        applied = null;

        const restoredAt = Date.now();
        // Recovery means catching up with the head, which has moved on during
        // the outage — not merely writing one more row than before.
        const recovered = await ctx.settle(RECOVERY_TIMEOUT_MS);
        const seconds = (Date.now() - restoredAt) / 1_000;
        worstRecoveryS = Math.max(worstRecoveryS, seconds);
        const crashed = ctx.crashes.length - crashesBefore;

        if (!recovered) {
          const after = await ctx.progress();
          checks.push({
            name,
            status: "fail",
            detail:
              `never got back to the head (stuck at block ${after}, chain at ` +
              `${ctx.chain.height}, was at ${progressBefore} before the outage)`,
          });
          break;
        }
        checks.push({
          name,
          status: crashed > 0 ? "degraded" : "pass",
          detail:
            crashed > 0
              ? `needed ${crashed} restart${crashed === 1 ? "" : "s"}, back at the head after ${seconds.toFixed(1)}s`
              : `back at the head after ${seconds.toFixed(1)}s`,
        });
      }
    } finally {
      stopTicker();
      if (applied) await ctx.db.restore(applied).catch(() => {});
    }

    // Counted before the data check is appended, so it stays a count of
    // outages rather than of checks.
    const survived = checks.filter((check) => check.status !== "fail").length;
    ctx.metric("outages survived", `${survived}/${OUTAGES.length}`);
    ctx.metric("worst catch-up s", Number(worstRecoveryS.toFixed(1)));

    // The chain has stopped moving, so the tool has a fixed target to converge
    // on; anything still missing after this is missing for good.
    const data = await finalData(ctx, 90_000);
    if (data.status !== "pass") {
      checks.push({ name: "final data", status: "fail", detail: data.detail });
    }
    return {
      status: worst(checks),
      detail:
        data.status !== "pass"
          ? `survived ${survived} of ${OUTAGES.length} outages but ended with ${data.detail}`
          : survived < OUTAGES.length
            ? `survived ${survived} of ${OUTAGES.length} outages; ` +
              `${checks.find((c) => c.status === "fail")?.detail ?? ""}`
            : ctx.crashes.length > 0
              ? `survived every outage with correct data, after ${ctx.crashes.length} ` +
                `restart${ctx.crashes.length === 1 ? "" : "s"}`
              : `survived every outage without restarting, with correct data`,
      checks,
    };
  },
};
