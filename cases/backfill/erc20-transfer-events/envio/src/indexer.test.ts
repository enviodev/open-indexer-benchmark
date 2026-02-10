import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";

describe("Indexer Testing", () => {
  it("Should create accounts and transfer events from ERC20 Transfer events", async () => {
    const indexer = createTestIndexer();

    expect(
      await indexer.process({
        chains: {
          1: {
            startBlock: 18_600_000,
            endBlock: 18_600_200,
          },
        },
      }),
      "Should process Transfer events in the range"
    ).toMatchInlineSnapshot(`
      {
        "changes": [
          {
            "Allowance": {
              "sets": [
                {
                  "amount": 9281503455331943n,
                  "id": "0xd87b8e0db0cf9cbf9963c035a6ad72d614e37fd5-0x000000000022d473030f116ddee9f6b43ac78ba3",
                  "owner": "0xd87b8e0db0cf9cbf9963c035a6ad72d614e37fd5",
                  "spender": "0x000000000022d473030f116ddee9f6b43ac78ba3",
                },
              ],
            },
            "ApprovalEvent": {
              "sets": [
                {
                  "amount": 9281503455331943n,
                  "id": "18600002-300",
                  "owner": "0xd87b8e0db0cf9cbf9963c035a6ad72d614e37fd5",
                  "spender": "0x000000000022d473030f116ddee9f6b43ac78ba3",
                  "timestamp": 1700325983,
                },
              ],
            },
            "block": 18600002,
            "chainId": 1,
            "eventsProcessed": 1,
          },
          {
            "Account": {
              "sets": [
                {
                  "balance": -2000000000000000000n,
                  "id": "0x0338ce5020c447f7e668dc2ef778025ce398266b",
                },
              ],
            },
            "TransferEvent": {
              "sets": [
                {
                  "amount": 2000000000000000000n,
                  "from": "0x0338ce5020c447f7e668dc2ef778025ce398266b",
                  "id": "18600181-190",
                  "timestamp": 1700328167,
                  "to": "0x0000000000000000000000000000000000000000",
                },
              ],
            },
            "block": 18600181,
            "chainId": 1,
            "eventsProcessed": 1,
          },
          {
            "Account": {
              "sets": [
                {
                  "balance": 1124977443947969454n,
                  "id": "0x0000000000000000000000000000000000000000",
                },
                {
                  "balance": 875022556052030546n,
                  "id": "0x278e26310bb648b8e4f8e970fd21263f0c0ee4b1",
                },
              ],
            },
            "TransferEvent": {
              "sets": [
                {
                  "amount": 875022556052030546n,
                  "from": "0x0000000000000000000000000000000000000000",
                  "id": "18600198-193",
                  "timestamp": 1700328383,
                  "to": "0x278e26310bb648b8e4f8e970fd21263f0c0ee4b1",
                },
              ],
            },
            "block": 18600198,
            "chainId": 1,
            "eventsProcessed": 1,
          },
        ],
      }
    `);
  });
});
