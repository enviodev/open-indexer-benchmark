import { createConfig } from "ponder";
import { http } from "viem";

export default createConfig({
  networks: {
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  contracts: {
    // No specific contract needed as we're tracking all transactions
  },
  blocks: {
    ethereum: {
      network: "mainnet",
      interval: 1, // Process every block
      startBlock: 22280000,
      endBlock: 22290000, // Full case 4 block range
    }
  },
  database: {
    kind: "postgres",
    url: process.env.DATABASE_URL,
  },
}); 