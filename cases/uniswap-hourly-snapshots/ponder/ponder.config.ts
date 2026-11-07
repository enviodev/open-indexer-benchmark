import { createConfig } from "ponder";

import { UniswapV3PoolAbi } from "./abis/UniswapV3Pool";

// The benchmark runner always supplies an end block; without one the indexer
// would silently run unbounded and the verification phase would never finish.
function requireEndBlock(): number {
  const value = Number(process.env.PONDER_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "PONDER_END_BLOCK must be set to the block to stop at (the benchmark runner sets it)"
    );
  }
  return value;
}

const START_BLOCK = 21000000;
const END_BLOCK = requireEndBlock();

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1!,
    },
  },
  contracts: {
    UniswapV3Pool: {
      chain: "mainnet",
      abi: UniswapV3PoolAbi,
      address: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", // USDC/WETH 0.3%
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
    },
  },
  blocks: {
    HourlySnapshot: {
      chain: "mainnet",
      startBlock: START_BLOCK,
      endBlock: END_BLOCK,
      interval: 1,
    },
  },
});
