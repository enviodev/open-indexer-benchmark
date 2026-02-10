import { createConfig, mergeAbis } from "ponder";
import { http } from "viem";

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
      startBlock: 0,
      endBlock: 22200000
    }
  },
  blocks: {
    HourlyUpdate: {
      network: "mainnet",
      interval: 60 * 60 / 12, // Approximating hourly based on block time
      startBlock: 0,
      endBlock: 22200000
    }
  },
});
