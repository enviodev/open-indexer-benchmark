import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";

// Long enough to cross several hours, including ones without a swap: the pool
// swaps at 21,001,338 and not again until 21,002,703.
const START_BLOCK = 21_000_000;
const END_BLOCK = 21_002_000;

describe("Indexer Testing", () => {
  it("Should keep a snapshot for every hour, including hours without a swap", async () => {
    const indexer = createTestIndexer();
    const result = await indexer.process({
      chains: { 1: { startBlock: START_BLOCK, endBlock: END_BLOCK } },
    });

    const swaps: { block: number; sqrtPriceX96: bigint; tick: bigint }[] = [];
    const snapshots = new Map<string, any>();
    for (const change of result.changes as any[]) {
      for (const swap of change.Swap?.sets ?? []) {
        const pool = change.Pool.sets[change.Pool.sets.length - 1];
        swaps.push({ block: Number(swap.id.split("-")[0]), ...pool });
      }
      // Later writes to the same hour replace earlier ones, as they do in the
      // database.
      for (const snapshot of change.HourlySnapshot?.sets ?? []) {
        snapshots.set(snapshot.id, snapshot);
      }
    }

    expect(swaps.length, "Should index the pool's swaps").toBeGreaterThan(0);

    const hours = [...snapshots.values()].sort((a, b) => a.timestamp - b.timestamp);
    hours.forEach((hour, i) => {
      if (i > 0) {
        expect(hour.timestamp - hours[i - 1].timestamp, "Should skip no hour").toBe(3600);
      }
      const lastSwap = swaps.filter((swap) => swap.block <= hour.blockNumber).pop();
      expect(hour.sqrtPriceX96, "Should hold the price of the hour's last swap").toBe(
        lastSwap?.sqrtPriceX96
      );
    });
    const quietHours = hours.filter(
      (hour, i) =>
        i > 0 &&
        !swaps.some((swap) => swap.block > hours[i - 1].blockNumber && swap.block <= hour.blockNumber)
    );
    expect(quietHours.length, "Should cover hours without a swap").toBeGreaterThan(0);
    expect(hours[hours.length - 1].blockNumber, "Should close the last hour on the last block").toBe(
      END_BLOCK
    );
  });
});
