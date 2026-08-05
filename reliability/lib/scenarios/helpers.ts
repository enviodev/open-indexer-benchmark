// Small pieces every scenario wants, kept out of the scenarios themselves so
// each one reads as the story it is testing.

import { sleep } from "../../../cases/lib/process.ts";
import type { MockChain } from "../chain.ts";
import type { Check, CheckStatus, ScenarioContext } from "../harness.ts";
import { rowFields } from "../introspect.ts";

/**
 * Advance the chain on a wall-clock cadence, the way a real one arrives.
 *
 * Scenarios that only ever appended blocks up front would test backfill and
 * call it head tracking. Most of what goes wrong in production goes wrong at
 * the head, where the tool is reacting rather than catching up.
 */
export function startTicker(chain: MockChain, intervalMs: number) {
  const timer = setInterval(() => chain.append(1), intervalMs);
  return () => clearInterval(timer);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/** The worst status among a set of checks, which is the scenario's status. */
export function worst(checks: Check[]): CheckStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "pass";
}

/** "3 of 8 reorg cases mishandled", or "" when everything passed. */
export function summariseChecks(checks: Check[]): string {
  const failed = checks.filter((check) => check.status === "fail");
  const degraded = checks.filter((check) => check.status === "degraded");
  const parts: string[] = [];
  if (failed.length > 0) {
    parts.push(
      `${failed.length} of ${checks.length} cases wrong (${failed
        .map((check) => `${check.name}: ${check.detail}`)
        .join("; ")})`
    );
  }
  if (degraded.length > 0) {
    parts.push(
      `${degraded.length} needed help (${degraded
        .map((check) => `${check.name}: ${check.detail}`)
        .join("; ")})`
    );
  }
  return parts.join("; ");
}

/**
 * The standard end-of-scenario check: every row the tool holds, against the
 * chain as it finally stands.
 *
 * Both directions matter and for different reasons. Missing rows are the
 * failure everybody expects. Unexpected rows are the one that gets shipped:
 * they are what a reorg leaves behind when a tool forgets to unwind, and
 * nothing about the tool's own progress reporting will ever mention them.
 */
export async function describeData(ctx: ScenarioContext): Promise<{
  status: CheckStatus;
  detail: string;
}> {
  const { transfers, metadata } = await ctx.verify();
  const problems: string[] = [];
  for (const [label, diff] of [
    ["transfer", transfers],
    ["metadata", metadata],
  ] as const) {
    if (diff.missing.length > 0) {
      problems.push(
        `${diff.missing.length} ${label} rows missing of ${
          diff.missing.length + diff.matched
        }${blockSpan(diff.missing)}`
      );
    }
    if (diff.unexpected.length > 0) {
      problems.push(
        `${diff.unexpected.length} ${label} rows left over from orphaned blocks` +
          blockSpan(diff.unexpected)
      );
    }
    if (diff.duplicated.length > 0) {
      problems.push(
        `${diff.duplicated.length} duplicated ${label} rows${blockSpan(diff.duplicated)}`
      );
    }
  }
  return problems.length === 0
    ? { status: "pass", detail: "" }
    : { status: "fail", detail: problems.join(", ") };
}

/**
 * Wait for the tool's rows to match the chain, up to `timeoutMs`.
 *
 * `settle` alone is not enough to end a scenario on. It watches the highest
 * block with rows, which is a high-water mark: a tool that reverts to a
 * checkpoint and re-indexes forward still reports the old maximum throughout,
 * so a check taken the moment settle returns can catch it mid-recovery and
 * publish work-in-progress as data loss. Waiting for the condition actually
 * being asserted costs a few seconds on a passing run and is the difference
 * between measuring a tool and measuring a race.
 */
export async function awaitData(
  ctx: ScenarioContext,
  timeoutMs: number
): Promise<{ status: CheckStatus; detail: string }> {
  const deadline = Date.now() + timeoutMs;
  let last = await describeData(ctx);
  while (last.status !== "pass" && Date.now() < deadline) {
    await sleep(1_000);
    last = await describeData(ctx);
  }
  return last;
}

/**
 * The end of a scenario: let the tool converge, stop it cleanly, and check
 * again.
 *
 * The second check is not redundant. A tool that holds writes in memory and
 * drops them on shutdown looks perfect right up until it is asked to stop,
 * which is a thing that happens to every indexer on every deploy.
 */
export async function finalData(
  ctx: ScenarioContext,
  timeoutMs = 60_000
): Promise<{ status: CheckStatus; detail: string }> {
  const running = await awaitData(ctx, timeoutMs);
  await ctx.halt();
  await sleep(3_000);
  const stopped = await describeData(ctx);
  if (running.status === "pass" && stopped.status !== "pass") {
    return {
      status: "fail",
      detail: `${stopped.detail}, all of it lost during a clean shutdown`,
    };
  }
  return stopped;
}

/**
 * " (blocks 331-336)" for a set of canonical rows, whose first field is always
 * the block number.
 *
 * Worth the few lines: "12 rows missing" and "12 rows missing, all from the six
 * blocks either side of the outage" are the same failure to a checksum and
 * completely different findings to anyone trying to fix it.
 */
function blockSpan(rows: string[]): string {
  const blocks = rows
    .map((row) => Number(rowFields(row)[0]))
    .filter((block) => Number.isFinite(block));
  if (blocks.length === 0) return "";
  const low = Math.min(...blocks);
  const high = Math.max(...blocks);
  const distinct = new Set(blocks).size;
  return low === high
    ? ` (block ${low})`
    : ` (${distinct} blocks between ${low} and ${high})`;
}
