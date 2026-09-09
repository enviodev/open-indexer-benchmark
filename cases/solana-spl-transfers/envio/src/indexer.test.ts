import { describe, it, expect } from "vitest";
import { createTestIndexer, type Transfer } from "envio";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA = 7565164;

describe("SPL Token transfers", () => {
  it("stores USDC transfers over a pinned slot window", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: { [SOLANA]: { startBlock: 440_000_000, endBlock: 440_000_019 } },
    });

    const transfers: Transfer[] = await indexer.Transfer.getAll();

    // Both registrations have to fire: `transferChecked` through the
    // server-side mint filter, plain `transfer` through the source account's
    // token activity. A window that produced only one kind would leave half
    // the case untested.
    expect(transfers.some((t) => t.checked)).toBe(true);
    expect(transfers.some((t) => !t.checked)).toBe(true);

    for (const transfer of transfers) {
      expect(transfer).toMatchObject({
        id: expect.stringMatching(/^\d+-\d+-\d+(\.\d+)*$/),
        amount: expect.any(BigInt),
        source: expect.any(String),
        destination: expect.any(String),
        signer: expect.any(String),
        txSignature: expect.any(String),
        checked: expect.any(Boolean),
        slot: expect.any(Number),
        timestamp: expect.any(Number),
      });
      expect(transfer.slot).toBeGreaterThanOrEqual(440_000_000);
      expect(transfer.slot).toBeLessThanOrEqual(440_000_019);
    }
  }, 120_000);
});
