import { createConfig } from "ponder";
import { http } from "viem";

// Import ABIs
import { UniswapV2Router02ABI } from "./abis/UniswapV2Router02";

export default createConfig({
  // Use a simple SQLite database configuration
  networks: {
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  contracts: {
    UniswapV2Router02: {
      network: "mainnet",
      abi: UniswapV2Router02ABI,
      address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      startBlock: 22200000,
      endBlock: 22290000,
      includeCallTraces: true,
    }
  },
});
