import assert from "assert";
import { 
  TestHelpers,
  TransparentUpgradeableProxy_Transfer
} from "generated";
const { MockDb, TransparentUpgradeableProxy } = TestHelpers;

describe("TransparentUpgradeableProxy contract Transfer event tests", () => {
  // Create mock db
  const mockDb = MockDb.createMockDb();

  // Creating mock for TransparentUpgradeableProxy contract Transfer event
  const event = TransparentUpgradeableProxy.Transfer.createMockEvent({/* It mocks event fields with default values. You can overwrite them if you need */});

  it("TransparentUpgradeableProxy_Transfer is created correctly", async () => {
    // Processing the event
    const mockDbUpdated = await TransparentUpgradeableProxy.Transfer.processEvent({
      event,
      mockDb,
    });

    // Getting the actual entity from the mock database
    let actualTransparentUpgradeableProxyTransfer = mockDbUpdated.entities.TransparentUpgradeableProxy_Transfer.get(
      `${event.chainId}_${event.block.number}_${event.logIndex}`
    );

    // Creating the expected entity
    const expectedTransparentUpgradeableProxyTransfer: TransparentUpgradeableProxy_Transfer = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      from: event.params.from,
      to: event.params.to,
      value: event.params.value,
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    assert.deepEqual(actualTransparentUpgradeableProxyTransfer, expectedTransparentUpgradeableProxyTransfer, "Actual TransparentUpgradeableProxyTransfer should be the same as the expectedTransparentUpgradeableProxyTransfer");
  });
});
