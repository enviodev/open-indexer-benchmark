import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseConfig } from "../lib/case.ts";
import {
  canonicalRow,
  encodeAddress,
  encodeAmount,
  encodeSeconds,
} from "../lib/checksum.ts";
import { TRANSFER_TOPIC } from "../lib/hypersync.ts";

const START_BLOCK = 18_600_000;

// 1,000 blocks of USDC is roughly 9,000 Transfer events — small enough that
// the slowest indexer completes it in a few minutes, large enough that a
// broken batch or an off-by-one block boundary shows up in the checksum.
const VERIFY_END_BLOCK = 18_600_999;

export const caseConfig: CaseConfig = {
  name: "erc20-transfer-events",
  title: "Decoded Event Stream",
  dir: dirname(fileURLToPath(import.meta.url)),
  contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,
  topics: [TRANSFER_TOPIC],

  entities: [
    {
      key: "transferEvent",
      label: "transfer events",
      tableCandidates: ["TransferEvent", "transfer_event", "transfer"],
      fields: [
        { role: "from", kind: "address", candidates: ["from", "from_address", "sender"] },
        { role: "to", kind: "address", candidates: ["to", "to_address", "receiver"] },
        { role: "amount", kind: "amount", candidates: ["amount", "value"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
  ],

  computeExpected(logs) {
    const rows = logs.map((log) =>
      canonicalRow([
        encodeAddress(log.arg0),
        encodeAddress(log.arg1),
        encodeAmount(log.value),
        encodeSeconds(log.timestamp),
      ])
    );
    return { totalEvents: logs.length, entities: { transferEvent: rows } };
  },

  eventEntities: ["transferEvent"],
};
