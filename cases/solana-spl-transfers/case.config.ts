import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SvmCaseConfig } from "../lib/case.ts";
import { canonicalRow, encodeAmount, encodeBase58, encodeSeconds } from "../lib/checksum.ts";
import { snapshotEnvioRows } from "../lib/envio-snapshot.ts";
import { assertSlotRetained } from "../lib/hypersync-svm-retention.ts";

const START_SLOT = 440_000_000;

// 2,000 slots of USDC is roughly 58,000 transfers — enough that the rate is
// measuring indexing rather than the cost of opening a connection, and close
// enough in size to the EVM scenarios that the two read alike.
const VERIFY_END_SLOT = 440_001_999;

export const caseConfig: SvmCaseConfig = {
  name: "solana-spl-transfers",
  title: "Solana USDC Transfers",
  dir: dirname(fileURLToPath(import.meta.url)),
  startBlock: START_SLOT,
  verifyEndBlock: VERIFY_END_SLOT,

  // Solana's head is 445 million slots and climbing, and the throughput window
  // is only meaningful where USDC actually moves. Pinning it just past the
  // verification range keeps the window measuring transfers rather than the
  // walk to the head.
  throughputEndBlock: START_SLOT + 100_000,

  // Tools without a project directory here are simply not implemented yet and
  // are left out of the run. This one is a fact about the tool: HyperIndex
  // reads Solana instructions through HyperSync, and its RPC source has no
  // instruction handlers at all.
  unsupported: {
    "envio-rpc": "HyperIndex indexes Solana instructions through HyperSync only",
    "sqd-rpc": "SQD serves Solana through its Portal, not RPC",
  },

  entities: [
    {
      key: "transfer",
      label: "transfers",
      tableCandidates: ["Transfer", "transfer"],
      fields: [
        { role: "source", kind: "base58", candidates: ["source", "source_address"] },
        {
          role: "destination",
          kind: "base58",
          candidates: ["destination", "destination_address"],
        },
        { role: "amount", kind: "amount", candidates: ["amount"] },
        { role: "signer", kind: "base58", candidates: ["signer", "authority"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
  ],

  // The rows come from running the Envio project over the range — the case's
  // reference implementation — rather than from a second reading of the chain.
  // Which token a plain `transfer` moved is only knowable by joining the
  // transaction's balances, and writing that twice would leave two answers to
  // keep in step. What is committed is the snapshot; see ../lib/envio-snapshot.ts
  // for what that does and does not prove.
  async buildGroundTruth(token, onProgress) {
    await assertSlotRetained(token, START_SLOT);

    const rows = await snapshotEnvioRows(
      resolve(dirname(fileURLToPath(import.meta.url)), "envio"),
      START_SLOT,
      VERIFY_END_SLOT
    );
    if (rows.length === 0) {
      throw new Error(
        `the indexer produced no rows for slots ${START_SLOT}–${VERIFY_END_SLOT}`
      );
    }
    onProgress?.({ pass: "indexer", block: VERIFY_END_SLOT, logs: rows.length });

    return {
      totalEvents: rows.length,
      entities: {
        transfer: rows.map((row) =>
          canonicalRow([
            encodeBase58(row.source as string),
            encodeBase58(row.destination as string),
            encodeAmount(BigInt(row.amount as string)),
            encodeBase58(row.signer as string),
            encodeSeconds(row.timestamp as number),
          ])
        ),
      },
      lastEventBlock: rows.reduce(
        (highest, row) => Math.max(highest, row.slot as number),
        START_SLOT
      ),
    };
  },

  eventEntities: ["transfer"],
};
