// Chain reorganisations, in the shapes that actually catch tools out.
//
// Every indexer claims to handle reorgs, and on the easy case — the tip block
// is replaced, nothing else moves — they all do. The interesting cases are the
// ones a real chain produces rarely enough that nobody tests them:
//
//   a reorg deeper than one block, so the unwind has to walk;
//   a reorg that leaves the chain *shorter* than it was, so the head moves
//     backwards and a tool tracking "highest block seen" never notices;
//   several reorgs in a row, arriving before the unwind from the last one has
//     finished;
//   a reorg while the tool is still backfilling and nowhere near the head,
//     where the blocks being rewritten are ones it has not read yet;
//   a reorg deeper than the finality the endpoint promised, which no tool is
//     obliged to survive but which every tool should fail loudly on rather than
//     quietly serving wrong data forever.
//
// Because replacement blocks are built at a new epoch, their transfers differ
// from the ones they displaced. A row left behind from an orphaned block is
// therefore not merely stale, it is a value that exists nowhere on the chain —
// which is exactly what an application would read and act on.

import { sleep } from "../../../cases/lib/process.ts";
import type { MockChain } from "../chain.ts";
import type { Check, Scenario, ScenarioContext, ScenarioOutcome } from "../harness.ts";
import { awaitData, worst } from "./helpers.ts";

const WARMUP_BLOCKS = 120;

/** How long a tool gets to converge on the canonical chain after each case. */
const CONVERGE_TIMEOUT_MS = 120_000;

interface Variant {
  name: string;
  /** What to do to the chain. Returns nothing; the tail is common to all. */
  apply(chain: MockChain, ctx: ScenarioContext): Promise<void> | void;
  /**
   * A case no tool promises to handle. It is still run and still reported, but
   * failing it costs a scenario a "degraded" rather than a "fail": a tool that
   * is wrong only when the endpoint broke its own finality promise is in a
   * different class from one that is wrong about an ordinary three-block
   * reorg.
   */
  informational?: boolean;
}

const VARIANTS: Variant[] = [
  {
    name: "tip",
    apply: (chain) => {
      chain.reorg({ depth: 1 });
    },
  },
  {
    name: "3 deep",
    apply: (chain) => {
      chain.reorg({ depth: 3 });
    },
  },
  {
    name: "12 deep",
    apply: (chain) => {
      chain.reorg({ depth: 12 });
    },
  },
  {
    name: "shortening",
    apply: async (chain) => {
      // Six blocks replaced by three: for a few seconds the chain is genuinely
      // shorter than the tool has already indexed.
      chain.reorg({ depth: 6, replaceWith: 3 });
      await sleep(4_000);
    },
  },
  {
    name: "repeated",
    apply: async (chain) => {
      chain.reorg({ depth: 2 });
      await sleep(600);
      chain.reorg({ depth: 5 });
      await sleep(600);
      chain.reorg({ depth: 3 });
    },
  },
  {
    name: "during backfill",
    apply: async (chain, ctx) => {
      // Put the tool well behind the head, then rewrite blocks it has not read
      // yet. A tool that only compares hashes at the tip has nothing to compare.
      chain.append(80);
      await sleep(500);
      ctx.log(`  (tool at block ${await ctx.progress()}, chain at ${chain.height})`);
      chain.reorg({ depth: 20 });
    },
  },
  {
    name: "beyond finality",
    informational: true,
    apply: (chain) => {
      chain.reorg({ depth: chain.options.finalityDepth + 10 });
    },
  },
];

export const reorg: Scenario = {
  key: "reorg",
  title: "Reorg handling",
  summary:
    "Seven reorg shapes applied in sequence — tip, three deep, twelve deep, a chain that " +
    "gets shorter, three in a row, one during backfill, and one deeper than the endpoint's " +
    "finality. After each, the whole table is compared against the canonical chain.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2, finalityDepth: 64 },

  setup(chain) {
    chain.append(WARMUP_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    await ctx.start();
    if (!(await ctx.settle(300_000))) {
      return {
        status: "fail",
        detail: `did not reach the head within 300s, so no reorg was ever applied`,
      };
    }

    const checks: Check[] = [];
    // Problems a previous case already produced. A tool that mishandled the
    // three-deep reorg would otherwise fail every case after it for the same
    // orphaned rows, which says nothing new about the cases that follow.
    let knownMissing = new Set<string>();
    let knownUnexpected = new Set<string>();
    let worstConvergeS = 0;

    for (const variant of VARIANTS) {
      const headBefore = ctx.chain.height;
      ctx.log(`Reorg case: ${variant.name}`);
      await variant.apply(ctx.chain, ctx);

      // Grow past wherever the head was, so "caught up" is a question the tool
      // can answer — after a shortening reorg it is already past the new head,
      // and settling on that would prove nothing.
      ctx.chain.appendTo(headBefore + 2);

      const startedAt = Date.now();
      const converged = await ctx.settle(CONVERGE_TIMEOUT_MS);
      const seconds = (Date.now() - startedAt) / 1_000;
      worstConvergeS = Math.max(worstConvergeS, seconds);

      // Reaching the head is not the same as having converged on it: a tool
      // that reverts to a checkpoint and re-indexes forward keeps reporting the
      // old high-water mark the whole way. Wait for the rows themselves to
      // agree, or for this long, before deciding what is wrong.
      await awaitData(ctx, 20_000);

      const { transfers, metadata } = await ctx.verify();
      const missing = [...transfers.missing, ...metadata.missing];
      const unexpected = [...transfers.unexpected, ...metadata.unexpected];
      const duplicated = [...transfers.duplicated, ...metadata.duplicated];
      const newMissing = missing.filter((row) => !knownMissing.has(row));
      const newUnexpected = unexpected.filter((row) => !knownUnexpected.has(row));
      knownMissing = new Set(missing);
      knownUnexpected = new Set(unexpected);

      const problems: string[] = [];
      if (!converged) {
        problems.push(
          `did not catch up within ${CONVERGE_TIMEOUT_MS / 1_000}s ` +
            `(at block ${await ctx.progress()} of ${ctx.chain.height})`
        );
      }
      if (newUnexpected.length > 0) {
        problems.push(`${newUnexpected.length} rows kept from orphaned blocks`);
      }
      if (newMissing.length > 0) {
        problems.push(`${newMissing.length} rows of the new chain missing`);
      }
      if (duplicated.length > 0) problems.push(`${duplicated.length} duplicated rows`);

      checks.push({
        name: variant.name,
        status:
          problems.length === 0
            ? "pass"
            : variant.informational
              ? "degraded"
              : "fail",
        detail: problems.join(", ") || `converged in ${seconds.toFixed(1)}s`,
      });
      if (problems.length > 0) ctx.log(`  ✗ ${variant.name}: ${problems.join(", ")}`);
    }

    await ctx.halt();

    const failed = checks.filter((check) => check.status === "fail");
    const soft = checks.filter((check) => check.status === "degraded");
    ctx.metric("cases handled", `${checks.length - failed.length - soft.length}/${checks.length}`);
    ctx.metric("worst convergence s", Number(worstConvergeS.toFixed(1)));

    const detail =
      failed.length > 0
        ? `mishandled ${failed.map((check) => check.name).join(", ")} ` +
          `(${failed[0].detail})`
        : soft.length > 0
          ? `handled every ordinary reorg; ${soft
              .map((check) => `${check.name}: ${check.detail}`)
              .join("; ")}`
          : `handled all ${checks.length} reorg shapes`;

    return { status: worst(checks), detail, checks };
  },
};
