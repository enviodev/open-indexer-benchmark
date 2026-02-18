import assert from "assert";
import { 
  TestHelpers,
  UniswapV2Factory_PairCreated
} from "generated";
const { MockDb, UniswapV2Factory } = TestHelpers;

describe("UniswapV2Factory contract PairCreated event tests", () => {
  // Create mock db
  const mockDb = MockDb.createMockDb();

  // Creating mock for UniswapV2Factory contract PairCreated event
  const event = UniswapV2Factory.PairCreated.createMockEvent({/* It mocks event fields with default values. You can overwrite them if you need */});

  it("UniswapV2Factory_PairCreated is created correctly", async () => {
    // Processing the event
    const mockDbUpdated = await UniswapV2Factory.PairCreated.processEvent({
      event,
      mockDb,
    });

    // Getting the actual entity from the mock database
    let actualUniswapV2FactoryPairCreated = mockDbUpdated.entities.UniswapV2Factory_PairCreated.get(
      `${event.chainId}_${event.block.number}_${event.logIndex}`
    );

    // Creating the expected entity
    const expectedUniswapV2FactoryPairCreated: UniswapV2Factory_PairCreated = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      token0: event.params.token0,
      token1: event.params.token1,
      pair: event.params.pair,
      _3: event.params._3,
    };
    // Asserting that the entity in the mock database is the same as the expected entity
    assert.deepEqual(actualUniswapV2FactoryPairCreated, expectedUniswapV2FactoryPairCreated, "Actual UniswapV2FactoryPairCreated should be the same as the expectedUniswapV2FactoryPairCreated");
  });
});
