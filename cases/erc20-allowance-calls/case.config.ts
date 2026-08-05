import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseConfig } from "../lib/case.ts";
import {
  canonicalRow,
  encodeAddress,
  encodeAmount,
  encodeSeconds,
} from "../lib/checksum.ts";
import { APPROVAL_TOPIC } from "../lib/hypersync.ts";
import type { EthCall } from "../lib/rpc-mock.ts";

/**
 * The eight ERC-20s with the most `Approval` traffic on Ethereum Mainnet over
 * the case's range, which between them emit about 16 approvals per block.
 *
 * The case is deliberately scoped to a list rather than to every `Approval` on
 * the chain. ERC-721's `Approval(address,address,uint256)` hashes to the same
 * topic0 as ERC-20's, with the third argument indexed instead of in the data,
 * so an unfiltered subscription hands every indexer a stream in which roughly
 * one log in fourteen decodes under a different layout — and each tool's
 * decoder deals with that differently. That is a finding about event decoding,
 * not about contract calls, and it does not belong in the middle of this
 * measurement.
 */
const TOKENS = [
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0x68749665ff8d2d112fa859aa293f07a622782f38", // XAUt (Tether Gold)
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", // USDe
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e", // crvUSD
];

const TOKEN_SET = new Set(TOKENS);

const START_BLOCK = 25_600_000;

// 1,200 blocks hold about 19,700 approvals, roughly 16,200 of which need a
// call. An indexer that keeps the endpoint's 100 call slots full the whole
// time gets through them in a little under a minute; one that waits for each
// call before starting the next needs an hour and a half. The range is sized
// for the first to finish comfortably inside the ten-minute cap, so what the
// table reports for the rest is how much of it they reached.
const VERIFY_END_BLOCK = 25_601_199;

/** `allowance(address,address)` */
export const ALLOWANCE_SELECTOR = "0xdd62ed3e";

/**
 * The allowance the chain reports for a pair at a block.
 *
 * Derived from the call's own arguments rather than fetched, which is what
 * makes the case reproducible — and unguessable. The value appears in no log,
 * so the only way an indexer's rows can match the ground truth is by having
 * made the call, at the block the event was in, and stored the answer.
 *
 * Truncated to 64 bits, which is the range a token balance actually lives in
 * (about 18 whole tokens at 18 decimals) and comfortably inside every numeric
 * type the six implementations store it in.
 */
export function allowanceOf(
  token: string,
  owner: string,
  spender: string,
  block: number
): bigint {
  const digest = createHash("sha256")
    .update(`${token}|${owner}|${spender}|${block}`)
    .digest("hex");
  return BigInt(`0x${digest.slice(0, 16)}`);
}

/** The 20-byte address in the n-th 32-byte word of calldata, lowercase. */
function addressArg(data: string, index: number): string {
  const start = 10 + index * 64;
  return `0x${data.slice(start + 24, start + 64)}`;
}

/**
 * Answer an intercepted `eth_call`, or refuse it.
 *
 * Only `allowance(owner, spender)` on one of the case's tokens is defined.
 * Everything else — a `multicall` aggregate that would collapse a batch of
 * reads into one round trip, a token metadata read, a call at the chain head —
 * is refused, so every tool is measured making the same calls rather than
 * whichever ones its implementation found a way to avoid.
 */
function answerCall(call: EthCall): string | null {
  if (!TOKEN_SET.has(call.to)) return null;
  if (!call.data.startsWith(ALLOWANCE_SELECTOR) || call.data.length !== 10 + 128) {
    return null;
  }
  const allowance = allowanceOf(
    call.to,
    addressArg(call.data, 0),
    addressArg(call.data, 1),
    call.block
  );
  return `0x${allowance.toString(16).padStart(64, "0")}`;
}

export const caseConfig: CaseConfig = {
  name: "erc20-allowance-calls",
  title: "External Contract Calls",
  dir: dirname(fileURLToPath(import.meta.url)),
  contract: TOKENS,
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,
  topics: [APPROVAL_TOPIC],

  ethCall: {
    // Slow enough that an indexer waiting on one call at a time cannot hide it,
    // and slow enough to be a plausible archive-node round trip.
    latencyMs: 300,
    // What a provider gives one API key. Every tool is up against the same
    // ceiling, so no implementation can win the case by asking for more.
    maxConcurrent: 100,
    answer: answerCall,
  },

  entities: [
    {
      key: "approvalEvent",
      label: "approval events",
      tableCandidates: ["ApprovalEvent", "approval_event"],
      fields: [
        { role: "token", kind: "address", candidates: ["token", "token_address", "contract_address"] },
        { role: "owner", kind: "address", candidates: ["owner", "owner_address"] },
        { role: "spender", kind: "address", candidates: ["spender", "spender_address"] },
        { role: "approved", kind: "amount", candidates: ["approved", "approved_amount"] },
        { role: "allowance", kind: "amount", candidates: ["allowance", "allowance_amount"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
    {
      key: "tokenAllowance",
      label: "allowances",
      tableCandidates: ["TokenAllowance", "token_allowance"],
      keyFieldCount: 3,
      fields: [
        { role: "token", kind: "address", candidates: ["token", "token_address", "contract_address"] },
        { role: "owner", kind: "address", candidates: ["owner", "owner_address"] },
        { role: "spender", kind: "address", candidates: ["spender", "spender_address"] },
        { role: "allowance", kind: "amount", candidates: ["allowance", "allowance_amount", "amount"] },
      ],
    },
  ],

  computeExpected(logs) {
    // Mirrors the case logic in the README: an approval of zero settles the
    // allowance at zero without a call, and any other approval is followed by
    // a read of the allowance the token now reports for the pair.
    const approvalRows: string[] = [];
    const latest = new Map<string, string[]>();

    for (const log of logs) {
      const token = encodeAddress(log.address);
      const owner = encodeAddress(log.arg0);
      const spender = encodeAddress(log.arg1);
      const allowance =
        log.value === BigInt(0)
          ? BigInt(0)
          : allowanceOf(token, owner, spender, log.blockNumber);

      approvalRows.push(
        canonicalRow([
          token,
          owner,
          spender,
          encodeAmount(log.value),
          encodeAmount(allowance),
          encodeSeconds(log.timestamp),
        ])
      );
      latest.set(`${token}|${owner}|${spender}`, [
        token,
        owner,
        spender,
        encodeAmount(allowance),
      ]);
    }

    return {
      totalEvents: approvalRows.length,
      entities: {
        approvalEvent: approvalRows,
        tokenAllowance: [...latest.values()].map((fields) => canonicalRow(fields)),
      },
    };
  },

  eventEntities: ["approvalEvent"],
};
