// Data the chain says is real and the database cannot hold.
//
// A `string` in an event is a byte array with no rules attached. Contracts emit
// NUL bytes in them — sometimes from a fixed-size buffer copied wholesale,
// sometimes on purpose — and PostgreSQL cannot store a NUL in a `text` column,
// because its wire protocol terminates strings on one. So an indexer meets a
// value it must not drop and cannot write, in the middle of its own write path.
//
// There is no perfect answer, and this scenario does not pretend otherwise. It
// asks two things a benchmark can be fair about:
//
//   Did the tool keep going? A crash loop on one log means every contract that
//   tool indexes stops at that block, forever, until a human intervenes.
//
//   Did it say anything? Storing the value with the NUL stripped is fine.
//   Storing it escaped is fine. Skipping the row and logging it is defensible.
//   Skipping it silently is the one outcome an operator cannot recover from,
//   because nothing in the database ever suggests a row is missing.
//
// The same block also carries a transfer of 2^256-1, which is what a uint256
// column is for and what a bigint column is not.

import { sleep } from "../../../cases/lib/process.ts";
import { HOSTILE_NAME, HOSTILE_SYMBOL, HOSTILE_VALUE, ZERO_ADDRESS } from "../chain.ts";
import type { Check, Scenario, ScenarioOutcome } from "../harness.ts";
import { rowFields } from "../introspect.ts";
import { worst } from "./helpers.ts";

const HOSTILE_BLOCK = 40;
const TOTAL_BLOCKS = 90;

/** What a value looks like once the byte PostgreSQL refuses has been dropped. */
const withoutNuls = (text: string) => text.replaceAll("\u0000", "");

/** Readable form of whatever ended up stored, for the published note. */
const show = (text: string) =>
  JSON.stringify(text.length > 60 ? `${text.slice(0, 59)}…` : text);

export const hostileData: Scenario = {
  key: "hostile-data",
  title: "Hostile values",
  summary:
    "One block emits a token symbol containing a NUL byte, a name with an emoji, a tab and " +
    "a newline, and a transfer of 2^256-1. Checks that the indexer gets past the block and " +
    "that the values are not silently lost.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.emitHostileDataAt(HOSTILE_BLOCK);
    chain.append(TOTAL_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    await ctx.start();

    const reached = await ctx.settle(300_000);
    const progress = await ctx.progress();
    const checks: Check[] = [];

    if (!reached && progress < HOSTILE_BLOCK) {
      // The interesting failure: not "it stored the wrong thing" but "it never
      // got past the block at all", which is a stuck pipeline, not a bad row.
      return {
        status: "fail",
        detail:
          `stopped at block ${progress} and never got past the hostile block ` +
          `${HOSTILE_BLOCK}` +
          (ctx.crashes.length > 0
            ? `, after ${ctx.crashes.length} crashes`
            : ", without crashing"),
        checks,
      };
    }

    checks.push({
      name: "kept indexing",
      status: reached ? "pass" : "degraded",
      detail: reached
        ? `reached block ${progress}`
        : `got past the hostile block but only reached ${progress} of ${ctx.chain.height}`,
    });

    // Let anything buffered land before reading the tables.
    await sleep(2_000);

    // ── The metadata row ──
    const metadataRows = await ctx.rows("tokenMetadata");
    const row = metadataRows.find((text) => rowFields(text)[0] === String(HOSTILE_BLOCK));
    if (!row) {
      checks.push({
        name: "symbol stored",
        status: "fail",
        detail: `no metadata row for block ${HOSTILE_BLOCK}: the event was dropped silently`,
      });
    } else {
      const [, , symbol, name] = rowFields(row);
      const exact = symbol === HOSTILE_SYMBOL && name === HOSTILE_NAME;
      const stripped =
        symbol === withoutNuls(HOSTILE_SYMBOL) && name === withoutNuls(HOSTILE_NAME);
      checks.push({
        name: "symbol stored",
        status: exact || stripped ? "pass" : "degraded",
        detail: exact
          ? `stored the symbol byte for byte, NUL included, as ${show(symbol)}`
          : stripped
            ? `stored the symbol as ${show(symbol)}, with only the NUL byte dropped`
            : `stored as ${show(symbol)} / ${show(name)}, which is neither the emitted ` +
              `value nor that value with the NUL removed`,
      });
    }

    // ── The uint256 transfer ──
    const transferRows = await ctx.rows("transferEvent");
    const hostileTransfer = transferRows.find((text) => {
      const [block, , from] = rowFields(text);
      return block === String(HOSTILE_BLOCK) && from === ZERO_ADDRESS;
    });
    if (!hostileTransfer) {
      checks.push({
        name: "uint256 max",
        status: "fail",
        detail: `the transfer of 2^256-1 in block ${HOSTILE_BLOCK} was not stored`,
      });
    } else {
      const value = rowFields(hostileTransfer)[4];
      checks.push({
        name: "uint256 max",
        status: value === HOSTILE_VALUE.toString() ? "pass" : "fail",
        detail:
          value === HOSTILE_VALUE.toString()
            ? "stored exactly"
            : `stored as ${value}, not ${HOSTILE_VALUE}`,
      });
    }

    await ctx.halt();

    const failed = checks.filter((check) => check.status === "fail");
    const soft = checks.filter((check) => check.status === "degraded");
    ctx.metric("crash loops", ctx.crashes.length);

    return {
      status: worst(checks),
      detail:
        failed.length > 0
          ? failed.map((check) => check.detail).join("; ")
          : soft.length > 0
            ? soft.map((check) => check.detail).join("; ")
            : `kept indexing and ${
                checks.find((check) => check.name === "symbol stored")?.detail ??
                "stored the values"
              }` +
              (ctx.crashes.length > 0
                ? `, after ${ctx.crashes.length} restarts`
                : ", without restarting"),
      checks,
    };
  },
};
