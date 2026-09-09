// Solana HyperSync preconditions for SVM cases. The ground truth itself comes
// from the scenario's reference indexer (see envio-snapshot.ts); what is left
// here is the one thing a snapshot cannot check about itself.

import { post } from "./hypersync.ts";

const HYPERSYNC_URL = "https://solana.hypersync.xyz/query";

/**
 * Fails unless `slot` is inside the retention window.
 *
 * Solana HyperSync keeps a rolling window — tens of millions of slots behind
 * the head — and answers a request from below its floor with data from the
 * floor rather than refusing it. A range that has aged out would otherwise
 * verify happily against whatever the floor happens to hold.
 */
export async function assertSlotRetained(token: string, slot: number): Promise<void> {
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
