// Solana HyperSync client for the ground truth of SVM cases. Separate from
// hypersync.ts because nothing carries over: Solana has instruction calls
// rather than logs, positional accounts rather than topics, and the query
// speaks slots.

import { post } from "./hypersync.ts";
import type { FetchProgress } from "./hypersync.ts";

const HYPERSYNC_URL = "https://solana.hypersync.xyz/query";

export const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** One-byte SPL Token instruction tags. */
export const TRANSFER_TAG = "0x03";
export const TRANSFER_CHECKED_TAG = "0x0c";
/** `initializeAccount`, `initializeAccount2`, `initializeAccount3`. All three
 *  take the new account in slot 0 and its mint in slot 1. */
const INITIALIZE_ACCOUNT_TAGS = ["0x01", "0x10", "0x12"];

/** One decoded SPL Token transfer, in the shape the case logic reads. */
export interface SplTransfer {
  slot: number;
  /** Unix seconds of the containing block. */
  timestamp: number;
  /** Base58 `signatures[0]`, the canonical transaction id. */
  signature: string;
  amount: bigint;
  source: string;
  destination: string;
  /** The `authority` account: the source's owner, delegate, or multisig. */
  signer: string;
  /** True for `transferChecked`, which names its mint; false for `transfer`. */
  checked: boolean;
}

interface RawInstruction {
  slot: number;
  transaction_index: number;
  a0: string;
  a1: string;
  a2: string;
  a3: string | null;
  data: string;
}

/** Little-endian u64 from a hex instruction payload, starting at `byte`. */
function u64At(data: string, byte: number): bigint {
  let value = BigInt(0);
  for (let i = 7; i >= 0; i--) {
    const offset = (byte + i) * 2;
    value = (value << BigInt(8)) | BigInt(`0x${data.slice(offset, offset + 2)}`);
  }
  return value;
}

/**
 * Fails unless `slot` is inside the retention window.
 *
 * Solana HyperSync keeps a rolling window — tens of millions of slots behind
 * the head — and answers a request from below its floor with data from the
 * floor rather than refusing it. A range that has aged out would otherwise
 * verify happily against whatever the floor happens to hold.
 */
async function assertSlotRetained(token: string, slot: number): Promise<void> {
  const response = await post(HYPERSYNC_URL, token, {
    from_slot: 0,
    field_selection: { block: ["slot"] },
  });
  const floor: number | undefined = response.blocks?.[0]?.[0]?.slot;
  if (floor === undefined) {
    throw new Error("HyperSync returned no block for slot 0 — cannot read the retention floor");
  }
  if (floor > slot) {
    throw new Error(
      `slot ${slot} has aged out of Solana HyperSync, which now starts at ${floor} — ` +
        `move the case's range forward`
    );
  }
}

/**
 * Every transfer of `mint` made through the SPL Token program in
 * `[fromSlot, toSlot]` (both inclusive), in slot order.
 *
 * The two instructions that move tokens need different treatment.
 * `transferChecked` names its mint in account slot 1, so it is filtered
 * server-side. Plain `transfer` does not name a mint at all — its accounts are
 * (source, destination, authority) — so every one of them is read and then kept
 * only if the transaction's token balances show one of its two token accounts
 * holding `mint`. That is the same resolution the indexers perform, and the
 * only one available: which token moved is simply not in the instruction.
 *
 * Either side answers it, because SPL Token rejects a transfer whose accounts
 * hold different mints. Reading only the source would miss the transfers whose
 * source is opened inside the same transaction: an account with no balance
 * before the transaction is absent from the balance records, and over a
 * 100-slot sample that is 538 of 4,266 unchecked transfers.
 *
 * A token account is either older than its transaction, in which case it has a
 * balance to report, or created inside it, in which case the transaction also
 * carries the `initializeAccount` that names its mint. The two cases are
 * exhaustive, so nothing of `mint` can move without leaving one of the two
 * traces — except through an account both created and closed inside a single
 * transaction, which reports no balance either side and is left holding only
 * its initialization. Those are read too, not to attribute a transfer but to
 * refuse to guess: finding one aborts the ground truth rather than silently
 * dropping a transfer. Over the case's range there are none.
 */
export async function fetchSplTransfers(opts: {
  token: string;
  mint: string;
  fromSlot: number;
  /** Inclusive. */
  toSlot: number;
  onProgress?: (progress: FetchProgress) => void;
}): Promise<SplTransfer[]> {
  const { token, mint, fromSlot, toSlot, onProgress } = opts;
  await assertSlotRetained(token, fromSlot);

  const instructions: RawInstruction[] = [];
  /** `slot:txIndex:account` of every account holding `mint` in a transaction. */
  const holdsMint = new Set<string>();
  /** The same key, for accounts a transaction opens on `mint`. */
  const openedOnMint = new Set<string>();
  const signatures = new Map<string, string>();
  const blockTimes = new Map<number, number>();

  let slot = fromSlot;
  while (slot <= toSlot) {
    const response = await post(HYPERSYNC_URL, token, {
      from_slot: slot,
      // HyperSync's `to_slot` is exclusive.
      to_slot: toSlot + 1,
      instructions: [
        {
          program_id: [SPL_TOKEN_PROGRAM],
          d1: [TRANSFER_CHECKED_TAG],
          a1: [mint],
        },
        { program_id: [SPL_TOKEN_PROGRAM], d1: [TRANSFER_TAG] },
        {
          program_id: [SPL_TOKEN_PROGRAM],
          d1: INITIALIZE_ACCOUNT_TAGS,
          a1: [mint],
        },
      ],
      account_activity: [{ mint: [mint] }],
      field_selection: {
        instruction: [
          "slot",
          "transaction_index",
          "a0",
          "a1",
          "a2",
          "a3",
          "data",
        ],
        transaction: ["slot", "transaction_index", "transaction_id"],
        account_activity: ["slot", "transaction_index", "account"],
        block: ["slot", "block_time"],
      },
    });

    for (const batch of response.instruction_calls ?? []) {
      for (const call of batch as RawInstruction[]) {
        const tag = `0x${call.data.slice(0, 2)}`;
        if (INITIALIZE_ACCOUNT_TAGS.includes(tag)) {
          openedOnMint.add(
            `${call.slot}:${call.transaction_index}:${call.a0}`
          );
        } else {
          instructions.push(call);
        }
      }
    }
    for (const batch of response.account_activity ?? []) {
      for (const activity of batch) {
        holdsMint.add(
          `${activity.slot}:${activity.transaction_index}:${activity.account}`
        );
      }
    }
    for (const batch of response.transactions ?? []) {
      for (const tx of batch) {
        signatures.set(`${tx.slot}:${tx.transaction_index}`, tx.transaction_id);
      }
    }
    for (const batch of response.blocks ?? []) {
      for (const block of batch) blockTimes.set(block.slot, block.block_time);
    }

    const next: number = response.next_slot;
    // A response that cannot advance would otherwise spin forever on one slot.
    if (next <= slot) break;
    slot = next;
    onProgress?.({
      pass: "instructions",
      block: Math.min(slot, toSlot),
      logs: instructions.length,
    });
  }

  const transfers: SplTransfer[] = [];
  for (const instruction of instructions) {
    const checked = instruction.data.startsWith("0c");
    const source = instruction.a0;
    const destination = checked ? instruction.a2 : instruction.a1;
    const key = `${instruction.slot}:${instruction.transaction_index}`;
    if (!checked && !holdsMint.has(`${key}:${source}`) && !holdsMint.has(`${key}:${destination}`)) {
      // No balance either side means both accounts are younger than the
      // transaction. If one of them was opened on this mint, the transfer is
      // ours and the balance records cannot show it — the case's stateless
      // resolution would drop a real transfer, and an indexer implementing the
      // documented logic would drop it too, so the disagreement to fix is in
      // the case rather than in anyone's implementation.
      if (openedOnMint.has(`${key}:${source}`) || openedOnMint.has(`${key}:${destination}`)) {
        throw new Error(
          `transfer at ${key} moves ${mint} between accounts that live and die inside ` +
            `their transaction, so no balance record can attribute it — the case's mint ` +
            `resolution needs the initialization lookup before this range can be used`
        );
      }
      continue;
    }

    const signature = signatures.get(key);
    const timestamp = blockTimes.get(instruction.slot);
    if (signature === undefined || timestamp === undefined) {
      throw new Error(
        `no transaction or block header for instruction at ${key} — ` +
          `the query returned an instruction without its join rows`
      );
    }

    transfers.push({
      slot: instruction.slot,
      timestamp,
      signature,
      // Both layouts put the amount straight after the one-byte tag.
      amount: u64At(instruction.data, 1),
      source,
      destination,
      signer: (checked ? instruction.a3 : instruction.a2) ?? "",
      checked,
    });
  }

  transfers.sort((a, b) => a.slot - b.slot);
  return transfers;
}
