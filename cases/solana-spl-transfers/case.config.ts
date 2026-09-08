import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SvmCaseConfig } from "../lib/case.ts";
import { canonicalRow, encodeAmount, encodeBase58, encodeSeconds } from "../lib/checksum.ts";
import { fetchSplTransfers } from "../lib/hypersync-svm.ts";

/** USD Coin. */
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const START_SLOT = 440_000_000;

// 2,000 slots of USDC is roughly 58,000 transfers — enough that the rate is
// measuring indexing rather than the cost of opening a connection, and close
// enough in size to the EVM scenarios that the two read alike.
const VERIFY_END_SLOT = 440_001_999;

export const caseConfig: SvmCaseConfig = {
  name: "solana-spl-transfers",
  title: "Solana Token Transfers",
  dir: dirname(fileURLToPath(import.meta.url)),
  startBlock: START_SLOT,
  verifyEndBlock: VERIFY_END_SLOT,

  // Solana's head is 445 million slots and climbing, and the throughput window
  // is only meaningful where USDC actually moves. Pinning it just past the
  // verification range keeps the window measuring transfers rather than the
  // walk to the head.
  throughputEndBlock: START_SLOT + 100_000,

  unsupported: {
    "envio-rpc": "HyperIndex indexes Solana instructions through HyperSync only",
    "envio-subgraph": "the Graph's subgraph manifest has no Solana equivalent",
    "envio-subgraph-rpc": "the Graph's subgraph manifest has no Solana equivalent",
    ponder: "EVM only",
    rindexer: "EVM only",
    "rindexer-hypersync": "EVM only",
    subgraph: "Graph Node does not index Solana",
    subquery: "supports Solana, no implementation in this repository yet",
    sqd: "supports Solana, no implementation in this repository yet",
    "sqd-rpc": "SQD reads Solana through its Portal, not RPC",
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

  async buildGroundTruth(token, onProgress) {
    const transfers = await fetchSplTransfers({
      token,
      mint: MINT,
      fromSlot: START_SLOT,
      toSlot: VERIFY_END_SLOT,
      onProgress,
    });
    if (transfers.length === 0) {
      throw new Error(
        `No ${MINT} transfers in slots ${START_SLOT}–${VERIFY_END_SLOT} — ` +
          `check the mint and the slot range`
      );
    }

    const rows = transfers.map((transfer) =>
      canonicalRow([
        encodeBase58(transfer.source),
        encodeBase58(transfer.destination),
        encodeAmount(transfer.amount),
        encodeBase58(transfer.signer),
        encodeSeconds(transfer.timestamp),
      ])
    );

    return {
      totalEvents: rows.length,
      entities: { transfer: rows },
      lastEventBlock: transfers.reduce(
        (highest, transfer) => (transfer.slot > highest ? transfer.slot : highest),
        START_SLOT
      ),
    };
  },

  eventEntities: ["transfer"],
};
