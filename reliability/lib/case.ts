// The project the reliability scenarios index, and the chain they index it from.
//
// This is a case in the same sense the throughput scenarios are: a contract, a
// start block, a schema, and one project directory per tool implementing it.
// What it is not is a benchmark case. It never reads a real network, it has no
// committed ground truth — the chain it reads is generated, so the truth is
// whatever the chain currently says — and it is not measured for speed. So it
// lives here, beside the harness that provokes it, rather than under cases/.
//
// The drivers are the throughput suite's, unchanged. Every one of them resolves
// its project directory as `resolve(config.dir, "<tool>")`, so pointing a
// driver at this config is the whole of what it takes to run a tool against the
// mock chain: the reliability projects sit next to this file under the names
// the drivers already look for.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseConfig } from "../../cases/lib/case.ts";
import { TRANSFER_TOPIC } from "../../cases/lib/hypersync.ts";
import type { ChainSpec } from "./chain-mock.ts";
import { SELECTORS, encodeString } from "./chain-mock.ts";

export const RELIABILITY_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Mainnet's id, because several tools treat an unknown chain as a
 * configuration error rather than as a chain. Nothing else about the chain is
 * mainnet — the tools are pointed at the mock endpoint and never at a real one.
 */
export const CHAIN_ID = 1;

/**
 * Where the generated chain starts. High enough to look like a real deployment
 * block to a tool that sanity-checks one, low enough to read at a glance in a
 * log. Blocks below it exist but carry nothing, so a tool that walks back
 * towards genesis finds ancestors rather than a hole.
 */
export const START_BLOCK = 1_000_000;

/** The token every generated log belongs to. */
export const TOKEN = "0x0000000000000000000000000000000000c0ffee";

/** Transfers per block. Two is enough for a log index to be wrong about. */
export const LOGS_PER_BLOCK = 2;

/**
 * The block the tools are configured to stop at.
 *
 * Reliability is measured at and around the head, so there is no end block in
 * any real sense — the tools have to be told one anyway, because every driver
 * takes it. A million blocks past the start is one no scenario comes close to,
 * so every tool runs as an open-ended head follower.
 */
export const NO_END_BLOCK = START_BLOCK + 1_000_000;

/**
 * The chain as every scenario starts it. A scenario that needs something else —
 * log indices near the 32-bit ceiling, a provider's range cap — overrides the
 * field it needs and leaves the rest, so the two chains differ in exactly the
 * thing under test.
 */
export function baseChainSpec(): ChainSpec {
  return {
    chainId: CHAIN_ID,
    startBlock: START_BLOCK,
    blockTimeS: 12,
    logsPerBlock: LOGS_PER_BLOCK,
    contract: TOKEN,
    calls: {
      // The token this suite indexes answers nothing for symbol(). Storing
      // that as a null is one of the data fidelity checks; every other
      // scenario simply needs the call not to hang.
      [SELECTORS.symbol]: null,
      [SELECTORS.name]: encodeString("Reliability Token"),
      [SELECTORS.decimals]: `0x${(18).toString(16).padStart(64, "0")}`,
      [SELECTORS.totalSupply]: `0x${"f".repeat(64)}`,
    },
  };
}

/**
 * What every reliability project writes.
 *
 * Three entities, each load-bearing. `transfer` is one row per log, carrying
 * the block, the log index and the amount — enough to say whether what a tool
 * holds is what the chain holds, which is the question behind every reorg and
 * crash check. `account` is the running balance those transfers move, and is
 * the only one of the three that can come out wrong without a row being
 * missing: it is how a replayed batch or an unrolled-back reorg becomes
 * visible. `token` is one row, written from a contract read, and exists for
 * the value that read returns: nothing at all.
 *
 * The candidates spell the same names in each framework's house style, because
 * that is the only thing that differs between the six projects.
 */
export const RELIABILITY_CASE: CaseConfig = {
  name: "reliability",
  title: "Reliability",
  dir: RELIABILITY_DIR,
  contract: TOKEN,
  startBlock: START_BLOCK,
  verifyEndBlock: NO_END_BLOCK,
  topics: [TRANSFER_TOPIC],

  entities: [
    {
      key: "transfer",
      label: "transfers",
      tableCandidates: ["Transfer", "transfer", "transfer_event", "TransferEvent"],
      fields: [
        { role: "from", kind: "address", candidates: ["from", "from_address", "sender"] },
        { role: "to", kind: "address", candidates: ["to", "to_address", "receiver"] },
        { role: "amount", kind: "amount", candidates: ["amount", "value"] },
      ],
    },
    {
      // The aggregate, and the reason the suite can see a batch applied twice.
      // A transfer table is append-only: replaying blocks writes the same rows
      // again, and a primary key quietly absorbs it. A balance does not — it
      // ends up doubled — which is what makes this the entity the crash and
      // reorg scenarios actually turn on.
      key: "account",
      label: "account balances",
      tableCandidates: ["Account", "account", "accounts", "balance", "Balance"],
      fields: [
        { role: "address", kind: "address", candidates: ["id", "address", "account"] },
        { role: "balance", kind: "amount", candidates: ["balance", "amount", "value"] },
      ],
    },
    {
      key: "token",
      label: "tokens",
      tableCandidates: ["Token", "token", "token_meta", "TokenMeta"],
      fields: [
        // Resolution uses these to pick between two tables that both match a
        // name candidate, so they earn their place even though the reliability
        // checks read the columns themselves rather than a checksum of them.
        { role: "symbol", kind: "text", candidates: ["symbol"] },
        { role: "name", kind: "text", candidates: ["name", "token_name"] },
      ],
    },
  ],

  eventEntities: ["transfer"],

  // Never called. The throughput runner builds ground truth by replaying
  // HyperSync logs through this; the reliability harness reads the chain it
  // generated, which knows what it served without anyone having to replay
  // anything. Throwing says so, where an implementation nothing calls would
  // read as one that matters.
  computeExpected() {
    throw new Error(
      "the reliability case has no HyperSync ground truth: its expectations come " +
        "from the generated chain, via chainRows() in observe.ts"
    );
  },
};
