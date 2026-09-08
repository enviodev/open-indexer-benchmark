// Ground truth taken from an indexer project's own run.
//
// A scenario whose logic cannot be replayed from raw chain data — Solana
// instructions carry positional accounts and a Borsh payload, and which token
// moved is only knowable by joining the transaction's balances — would
// otherwise need that logic written twice, once in the indexer and once in the
// harness, with nothing keeping the two in step.
//
// So the rows come from running the scenario's reference implementation over
// the verification range, and `expected.json` is the committed snapshot of
// what it produced. That makes the reference indexer's own row a regression
// check rather than an independent one: it passes by construction the day the
// snapshot is taken, and fails afterwards if its output ever changes. Every
// other indexer is still checked against a reference it had no part in.
// Regenerating is therefore a deliberate act, and the diff is the review.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { exec } from "./process.ts";

/**
 * Run `project`'s indexer over `[startBlock, endBlock]` and return the rows it
 * wrote, as plain JSON — wide integers arrive as decimal strings, since that
 * is what survives the round trip.
 *
 * The project is installed and code-generated first, the same way the driver
 * that benchmarks it does, so a fresh checkout needs no separate setup step.
 */
export async function snapshotEnvioRows(
  project: string,
  startBlock: number,
  endBlock: number
): Promise<Record<string, unknown>[]> {
  const dir = resolve(project);
  // Passed rather than left to the project's default: the config caps the test
  // indexer at its own end block, and a stale default there would quietly
  // truncate the snapshot instead of failing.
  const env = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_END_BLOCK: String(endBlock),
  };

  await exec("pnpm", ["install", "--frozen-lockfile"], dir, env);
  await exec("pnpm", ["envio", "codegen"], dir, env);

  const scratch = mkdtempSync(join(tmpdir(), "envio-snapshot-"));
  const out = join(scratch, "rows.json");
  try {
    // Written to a file rather than read off stdout: the indexer logs there
    // too, and the rows would arrive interleaved with whatever it had to say.
    await exec(
      "node",
      ["snapshot.mjs", String(startBlock), String(endBlock), out],
      dir,
      env
    );
    return JSON.parse(readFileSync(out, "utf8"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
