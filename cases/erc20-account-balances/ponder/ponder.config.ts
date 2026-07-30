import { createConfig } from "ponder";

import { RocketTokenRETHAbi } from "./abis/RocketTokenRETH";

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

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1!,
    },
  },
  contracts: {
    RocketTokenRETH: {
      chain: "mainnet",
      abi: RocketTokenRETHAbi,
      address: "0xae78736cd615f374d3085123a210448e74fc6393",
      startBlock: 18600000,
      endBlock: requireEndBlock(),
    },
  },
});
