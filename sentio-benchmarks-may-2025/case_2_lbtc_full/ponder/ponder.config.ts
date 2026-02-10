import { createConfig, mergeAbis } from "ponder";
import { http } from "viem";

// Remove dotenv import and config
// import { config } from "dotenv";
// config({ path: '.env.local' });

if (!process.env.PONDER_RPC_URL_1) {
  throw new Error('PONDER_RPC_URL_1 is required in environment variables');
}

import { LBTCAbi } from "./abis/LBTCAbi";

export default createConfig({
  networks: {
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  contracts: {
    LBTC: {
      network: "mainnet",
      abi: LBTCAbi,
      address: "0x8236a87084f8B84306f72007F36F2618A5634494",
      startBlock: 22400000,
      endBlock: 22500000,
    }
  },
  blocks: {
    HourlyUpdate: {
      network: "mainnet",
      interval: 60 * 60 / 12, // Approximating hourly based on block time
      startBlock: 22400000,
      endBlock: 22500000,
    }
  },
});
