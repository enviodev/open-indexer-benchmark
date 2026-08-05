// A data source that is up, but not reliably.
//
// Nobody runs an indexer against a perfect endpoint. Providers return 429s
// under load, 500s during a deploy, and — worst of all — occasionally answer
// "no such block" for a block they announced a moment earlier, because the
// request went to a replica that has not caught up. A tool that treats any of
// those as fatal wakes somebody up; a tool that treats a missing block as an
// empty block corrupts its own data and never mentions it.
//
// Two phases, because they break different things. The first is the ordinary
// bad day: errors, rate limits, latency, and the occasional phantom missing
// block, applied while the tool is backfilling. The second is the endpoint
// misbehaving rather than failing — truncated response bodies and dropped
// sockets, which get past a client that only checks the HTTP status.
//
// Then the faults are switched off, and the only question that matters is asked:
// once the endpoint is healthy again, does the tool end up with exactly the
// right data, without anyone having touched it?

import { sleep } from "../../../cases/lib/process.ts";
import type { Check, Scenario, ScenarioOutcome } from "../harness.ts";
import { finalData, startTicker, worst } from "./helpers.ts";

const WARMUP_BLOCKS = 250;
const BLOCK_INTERVAL_MS = 2_000;

const FLAKY_PHASE_MS = 60_000;
const MALFORMED_PHASE_MS = 30_000;
/** How long the chain keeps producing after the endpoint recovers. */
const MOVING_HEAD_MS = 60_000;
const RECOVERY_TIMEOUT_MS = 300_000;

export const rpcChaos: Scenario = {
  key: "rpc-chaos",
  title: "Flaky RPC",
  summary:
    "The endpoint returns 500s, 429s, extra latency and the occasional phantom missing " +
    "block, then truncated bodies and dropped sockets. Checks that the tool catches up " +
    "with correct data once it is healthy again, and how often it died first.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.append(WARMUP_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    const checks: Check[] = [];

    // Faults are on before the tool starts: a backfill that begins on a healthy
    // endpoint and only meets trouble later exercises a much shorter path.
    Object.assign(ctx.rpc.faults, {
      httpErrorRate: 0.25,
      rateLimitRate: 0.1,
      rpcErrorRate: 0.1,
      missingBlockRate: 0.05,
      delayMs: 50,
    });
    ctx.log("Endpoint degraded: 25% 500s, 10% 429s, 10% RPC errors, 5% phantom missing blocks");

    await ctx.start();
    await sleep(FLAKY_PHASE_MS);

    const duringFlaky = await ctx.progress();
    ctx.log(`After ${FLAKY_PHASE_MS / 1_000}s of errors the tool is at block ${duringFlaky}`);

    Object.assign(ctx.rpc.faults, {
      httpErrorRate: 0,
      rateLimitRate: 0,
      rpcErrorRate: 0,
      missingBlockRate: 0,
      delayMs: 0,
      malformedRate: 0.15,
      dropRate: 0.1,
    });
    ctx.log("Endpoint now returning truncated bodies and dropping sockets");
    await sleep(MALFORMED_PHASE_MS);

    ctx.rpc.heal();
    ctx.log("Endpoint healthy again");

    // The chain does not politely stop while a tool recovers, so it keeps
    // producing for a while yet — the tool has to work through the backlog the
    // outage left *and* the blocks arriving on top of it. The ticker then stops,
    // giving a fixed finish line to be measured against.
    const startedAt = Date.now();
    const stopTicker = startTicker(ctx.chain, BLOCK_INTERVAL_MS);
    await sleep(MOVING_HEAD_MS);
    stopTicker();

    const caughtUp = await ctx.settle(RECOVERY_TIMEOUT_MS);
    ctx.metric("catch-up s", Number(((Date.now() - startedAt) / 1_000).toFixed(1)));
    checks.push({
      name: "caught up",
      status: caughtUp ? "pass" : "fail",
      detail: caughtUp
        ? `back at the head`
        : `still at block ${await ctx.progress()} of ${ctx.chain.height} ` +
          `${RECOVERY_TIMEOUT_MS / 1_000}s after the endpoint recovered`,
    });

    const data = await finalData(ctx, 90_000);
    checks.push({
      name: "final data",
      status: data.status,
      detail: data.detail || "matches the chain",
    });

    const injected = Object.values(ctx.rpc.stats.faults).reduce((a, b) => a + b, 0);
    ctx.metric("faults injected", injected);
    ctx.metric("rpc calls", ctx.rpc.stats.total);

    return {
      status: worst(checks),
      detail:
        data.status !== "pass"
          ? `ended with ${data.detail} after ${injected} injected faults`
          : !caughtUp
            ? checks[0].detail
            : ctx.crashes.length > 0
              ? `recovered with correct data, after ${ctx.crashes.length} ` +
                `crash${ctx.crashes.length === 1 ? "" : "es"} across ${injected} injected faults`
              : `rode out ${injected} injected faults without crashing, with correct data`,
      checks,
    };
  },
};
