import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseConfig } from "../lib/case.ts";
import {
  canonicalRow,
  encodeAddress,
  encodeAmount,
  encodeSeconds,
} from "../lib/checksum.ts";
import { APPROVAL_TOPIC, TRANSFER_TOPIC } from "../lib/hypersync.ts";

const START_BLOCK = 18_600_000;

// rETH is far less active than USDC, so the verification range spans 100,000
// blocks to reach a comparable number of events while still completing on the
// slowest indexer within the phase timeout.
const VERIFY_END_BLOCK = 18_699_999;

export const caseConfig: CaseConfig = {
  name: "erc20-account-balances",
  title: "State Aggregation",
  dir: dirname(fileURLToPath(import.meta.url)),
  contract: "0xae78736cd615f374d3085123a210448e74fc6393",
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,
  topics: [TRANSFER_TOPIC, APPROVAL_TOPIC],

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
    {
      key: "approvalEvent",
      label: "approval events",
      tableCandidates: ["ApprovalEvent", "approval_event", "approval"],
      fields: [
        { role: "owner", kind: "address", candidates: ["owner", "owner_address"] },
        { role: "spender", kind: "address", candidates: ["spender", "spender_address"] },
        { role: "amount", kind: "amount", candidates: ["amount", "value"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
    {
      key: "account",
      label: "account balances",
      tableCandidates: ["Account", "account"],
      keyFieldCount: 1,
      fields: [
        { role: "id", kind: "address", candidates: ["id", "address", "holder"] },
        { role: "balance", kind: "amount", candidates: ["balance"] },
      ],
    },
    {
      key: "allowance",
      label: "allowances",
      tableCandidates: ["Allowance", "allowance"],
      keyFieldCount: 2,
      fields: [
        { role: "owner", kind: "address", candidates: ["owner", "owner_address"] },
        { role: "spender", kind: "address", candidates: ["spender", "spender_address"] },
        { role: "amount", kind: "amount", candidates: ["amount", "value"] },
      ],
    },
  ],

  computeExpected(logs) {
    // Mirrors the case logic in the README: balances accumulate transfer
    // deltas (so a self-transfer nets to zero) and an allowance is overwritten
    // by the latest Approval for its (owner, spender) pair.
    const balances = new Map<string, bigint>();
    const allowances = new Map<string, string[]>();
    const transferRows: string[] = [];
    const approvalRows: string[] = [];

    for (const log of logs) {
      if (log.topic0 === TRANSFER_TOPIC) {
        const from = encodeAddress(log.arg0);
        const to = encodeAddress(log.arg1);
        balances.set(from, (balances.get(from) ?? BigInt(0)) - log.value);
        balances.set(to, (balances.get(to) ?? BigInt(0)) + log.value);
        transferRows.push(
          canonicalRow([
            from,
            to,
            encodeAmount(log.value),
            encodeSeconds(log.timestamp),
          ])
        );
      } else if (log.topic0 === APPROVAL_TOPIC) {
        const owner = encodeAddress(log.arg0);
        const spender = encodeAddress(log.arg1);
        allowances.set(`${owner}|${spender}`, [
          owner,
          spender,
          encodeAmount(log.value),
        ]);
        approvalRows.push(
          canonicalRow([
            owner,
            spender,
            encodeAmount(log.value),
            encodeSeconds(log.timestamp),
          ])
        );
      }
    }

    const accountRows = [...balances].map(([address, balance]) =>
      canonicalRow([address, encodeAmount(balance)])
    );
    const allowanceRows = [...allowances.values()].map((fields) =>
      canonicalRow(fields)
    );

    return {
      totalEvents: transferRows.length + approvalRows.length,
      entities: {
        transferEvent: transferRows,
        approvalEvent: approvalRows,
        account: accountRows,
        allowance: allowanceRows,
      },
    };
  },

  unsupported: {
    // The rust project's generated bindings are pinned to rindexer v0.41.0,
    // which predates HyperSync support. Regenerating them against v0.43.0+
    // (which ships it) turns this row on — a follow-up, since re-pinning the
    // crate also changes what the existing RPC row measures.
    "rindexer-hypersync":
      "its rust project's generated bindings are pinned to rindexer v0.41.0, " +
      "which predates HyperSync support; regenerating them against v0.43.0+ " +
      "turns this row on",
  },

  eventEntities: ["transferEvent", "approvalEvent"],
};
