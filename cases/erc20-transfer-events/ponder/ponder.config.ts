import { createConfig } from "ponder";

import { ERC20Abi } from "./abis/ERC20";

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
    },
  },
});
