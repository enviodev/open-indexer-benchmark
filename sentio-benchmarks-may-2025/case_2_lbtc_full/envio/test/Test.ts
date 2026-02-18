import assert from "assert";
import { TestHelpers } from "generated";
const { MockDb } = TestHelpers;

describe("LBTC contract Transfer event tests", () => {
  // Create mock db
  const mockDb = MockDb.createMockDb();

  // Creating mock for LBTC contract Transfer event
  const event = TestHelpers.LBTC.Transfer.createMockEvent({/* It mocks event fields with default values. You can overwrite them if you need */});

  it("LBTC_Transfer is created correctly", async () => {
    // Processing the event
    const mockDbUpdated = await TestHelpers.LBTC.Transfer.processEvent({
      event,
      mockDb,
    });

    // Getting the actual entity from the mock database
    let actualLBTCTransfer = mockDbUpdated.entities.Transfer.get(
      `${event.chainId}_${event.block.number}_${event.logIndex}`
    );

    // Creating the expected entity
    const expectedLBTCTransfer = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      from: event.params.from,
      to: event.params.to,
      value: event.params.value,
      blockNumber: event.block.number,
      transactionHash: event.transaction.hash
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    assert.deepEqual(actualLBTCTransfer, expectedLBTCTransfer, "Actual LBTC Transfer should be the same as the expected LBTC Transfer");
  });
});
