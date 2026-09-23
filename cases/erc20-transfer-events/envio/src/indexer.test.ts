import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";

describe("Indexer Testing", () => {
  it("Should store raw Transfer events from USDC without aggregation", async () => {
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        1: {
          startBlock: 18_600_000,
          endBlock: 18_600_050,
        },
      },
    });

    // Only TransferEvent records are written — no Account / Allowance aggregation.
    const transferSets = result.changes.flatMap(
      (change: any) => change.TransferEvent?.sets ?? []
    );

    expect(
      transferSets.length,
      "Should have stored at least one Transfer event"
    ).toBeGreaterThan(0);

    for (const transfer of transferSets) {
      expect(transfer).toHaveProperty("from");
      expect(transfer).toHaveProperty("to");
      expect(transfer).toHaveProperty("amount");
      expect(transfer).toHaveProperty("timestamp");
    }

    // No aggregation tables should be touched.
    for (const change of result.changes as any[]) {
      expect(change.Account).toBeUndefined();
      expect(change.Allowance).toBeUndefined();
      expect(change.ApprovalEvent).toBeUndefined();
    }
  });
});
