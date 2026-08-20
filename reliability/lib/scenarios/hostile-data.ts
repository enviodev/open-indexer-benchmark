// Data the chain says is real and the tool would rather not have.
//
// Three values, on two blocks, each of which some indexer somewhere has choked
// on. None of them is malformed: every one is a validly encoded thing a node
// will hand you, and an indexer that refuses it is refusing data the chain says
// happened.
//
//   A NUL byte in a token symbol. A `string` in an event is a byte array with
//   no rules attached, and contracts emit NUL bytes in them — sometimes from a
//   fixed-size buffer copied wholesale, sometimes on purpose. PostgreSQL cannot
//   store one in a `text` column, because its wire protocol terminates strings
//   on it. So the tool meets a value it must not drop and cannot write, in the
//   middle of its own write path.
//
//   A transfer of 2^256-1, which is what a uint256 column is for and what a
//   bigint column is not.
//
//   A log indexed near the top of the unsigned 32-bit range, which is what some
//   chains put on synthetic logs, and which halted a Ponder backfill in
//   ponder-sh/ponder#2373.
//
// Two questions a benchmark can be fair about, whatever anyone thinks the
// correct handling is:
//
//   Did the tool keep going? A crash loop or a hard stop on one log means every
//   contract that tool indexes stops at that block, forever, until a human
//   intervenes. That is the outcome an operator feels regardless of whose bug
//   it is.
//
//   Did it say anything? Storing the value with the NUL stripped is fine.
//   Storing it escaped is fine. Skipping the row and logging it is defensible.
//   Skipping it silently is the one outcome an operator cannot recover from,
//   because nothing in the database ever suggests a row is missing.
//
// The two hostile blocks are kept apart on purpose. Put on one block, a tool
// that stopped would leave no way to say which value stopped it.

import { sleep } from "../../../cases/lib/process.ts";
import {
  HOSTILE_NAME,
  HOSTILE_SYMBOL,
  HOSTILE_VALUE,
  LARGE_LOG_INDEX,
  ZERO_ADDRESS,
} from "../chain.ts";
import type { Check, Scenario, ScenarioOutcome } from "../harness.ts";
import { rowFields } from "../introspect.ts";
import { worst } from "./helpers.ts";

/** Carries the NUL-byte symbol and the uint256 max transfer. */
const NUL_BLOCK = 40;

/** Carries one transfer logged at `LARGE_LOG_INDEX`. */
const BIG_INDEX_BLOCK = 60;

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
    "Two blocks carry values a tool may not want: a token symbol containing a NUL byte, a " +
    "name with an emoji, a tab and a newline, a transfer of 2^256-1, and a log indexed at " +
    "0xfffffffc. Checks that the indexer gets past both blocks and that nothing is silently " +
    "lost.",
  chain: { blockTimeSeconds: 2, transfersPerBlock: 2 },

  setup(chain) {
    chain.emitHostileDataAt(NUL_BLOCK);
    chain.emitLargeLogIndexAt(BIG_INDEX_BLOCK);
    chain.append(TOTAL_BLOCKS);
  },

  async run(ctx): Promise<ScenarioOutcome> {
    await ctx.start();

    const reached = await ctx.settle(300_000);
    const progress = await ctx.progress();
    const checks: Check[] = [];

    // Which hostile blocks it never reached — stated, not blamed. A tool fetches
    // logs a range at a time, so one that refuses a range refuses every block in
    // it and comes to rest well short of the value that stopped it: Ponder halts
    // around block 25 over a log in block 60, having never read block 40 either.
    // From outside the process there is no way to tell those apart, so the note
    // says where it stopped and which blocks that cost. What the tool itself
    // said is evidence worth having, and the harness appends it to every result
    // that is not a pass, so it is not repeated here.
    const unreached = [NUL_BLOCK, BIG_INDEX_BLOCK].filter((block) => progress < block);

    checks.push({
      name: "kept indexing",
      status: reached ? "pass" : "fail",
      detail: reached
        ? `reached block ${progress}`
        : `stopped at block ${progress} of ${ctx.chain.height}` +
          (unreached.length > 0
            ? `, never reaching the hostile block${unreached.length > 1 ? "s" : ""} ` +
              unreached.join(" and ")
            : "") +
          (ctx.crashes.length > 0
            ? `, after ${ctx.crashes.length} crashes`
            : ", without crashing or exiting"),
    });

    // Let anything buffered land before reading the tables.
    await sleep(2_000);

    const metadataRows = await ctx.rows("tokenMetadata");
    const transferRows = await ctx.rows("transferEvent");
    /** Rows the tool holds for one block, whatever their log index. */
    const rowsAt = (block: number) =>
      transferRows.filter((text) => rowFields(text)[0] === String(block));

    // ── The NUL byte ──
    const row = metadataRows.find((text) => rowFields(text)[0] === String(NUL_BLOCK));
    if (progress < NUL_BLOCK) {
      checks.push({
        name: "symbol stored",
        status: "fail",
        detail: `block ${NUL_BLOCK} was never indexed, so the symbol never reached the database`,
      });
    } else if (!row) {
      checks.push({
        name: "symbol stored",
        status: "fail",
        detail: `no metadata row for block ${NUL_BLOCK}: the event was dropped silently`,
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
    const hostileTransfer = rowsAt(NUL_BLOCK).find(
      (text) => rowFields(text)[2] === ZERO_ADDRESS
    );
    if (progress < NUL_BLOCK) {
      checks.push({
        name: "uint256 max",
        status: "fail",
        detail: `block ${NUL_BLOCK} was never indexed`,
      });
    } else if (!hostileTransfer) {
      checks.push({
        name: "uint256 max",
        status: "fail",
        detail: `the transfer of 2^256-1 in block ${NUL_BLOCK} was not stored`,
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

    // ── The large log index ──
    // Three outcomes worth telling apart: the log is there, the log is gone but
    // the tool carried on, and the tool stopped at that block. Only the last is
    // an indexer somebody has to go and restart.
    const atBigIndex = rowsAt(BIG_INDEX_BLOCK);
    const bigIndexRow = atBigIndex.find(
      (text) => rowFields(text)[1] === String(LARGE_LOG_INDEX)
    );
    if (progress < BIG_INDEX_BLOCK) {
      checks.push({
        name: "large log index",
        status: "fail",
        detail:
          `stopped before block ${BIG_INDEX_BLOCK}: the log indexed ` +
          `${LARGE_LOG_INDEX} (0x${LARGE_LOG_INDEX.toString(16)}) halted the backfill`,
      });
    } else if (bigIndexRow) {
      checks.push({
        name: "large log index",
        status: "pass",
        detail: `stored with its index of ${LARGE_LOG_INDEX} intact`,
      });
    } else {
      checks.push({
        name: "large log index",
        status: "degraded",
        detail:
          atBigIndex.length > 0
            ? `indexed the rest of block ${BIG_INDEX_BLOCK} but dropped the log ` +
              `indexed ${LARGE_LOG_INDEX}`
            : `indexed past block ${BIG_INDEX_BLOCK} without storing any of its logs`,
      });
    }

    await ctx.halt();

    const failed = checks.filter((check) => check.status === "fail");
    const soft = checks.filter((check) => check.status === "degraded");

    // A tool that stopped indexing did not also independently fail to store the
    // values on the blocks it never read; those checks are consequences of the
    // first one, and listing them all as findings buries the one that matters.
    const stalled = checks.find((check) => check.name === "kept indexing");
    const root =
      stalled?.status === "fail"
        ? [stalled]
        : failed.length > 0
          ? failed
          : soft;

    return {
      status: worst(checks),
      detail:
        root.length > 0
          ? root.map((check) => `${check.name}: ${check.detail}`).join("; ")
          : `kept indexing and stored every hostile value` +
            (ctx.crashes.length > 0
              ? `, after ${ctx.crashes.length} crashes`
              : ", without crashing"),
      checks,
    };
  },
};
