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
                  "id": "0xD87b8e0DB0cF9cBf9963C035A6AD72d614E37fd5-0x000000000022D473030F116dDEE9F6B43aC78BA3",
                  "owner": "0xD87b8e0DB0cF9cBf9963C035A6AD72d614E37fd5",
                  "spender": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
                },
              ],
            },
            "ApprovalEvent": {
              "sets": [
                {
                  "amount": 9281503455331943n,
                  "id": "18600002-300",
                  "owner": "0xD87b8e0DB0cF9cBf9963C035A6AD72d614E37fd5",
                  "spender": "0x000000000022D473030F116dDEE9F6B43aC78BA3",
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
                  "id": "0x0338CE5020c447f7e668DC2ef778025CE398266B",
                },
              ],
            },
            "TransferEvent": {
              "sets": [
                {
                  "amount": 2000000000000000000n,
                  "from": "0x0338CE5020c447f7e668DC2ef778025CE398266B",
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
                  "id": "0x278E26310Bb648b8e4f8e970fd21263F0c0EE4B1",
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
                  "to": "0x278E26310Bb648b8e4f8e970fd21263F0c0EE4B1",
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
