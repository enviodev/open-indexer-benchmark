import { createConfig } from "ponder";

import { ERC20Abi } from "./abis/ERC20";

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
    USDC: {
      chain: "mainnet",
      abi: ERC20Abi,
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      startBlock: 18600000,
      endBlock: requireEndBlock(),
    },
  },
});
