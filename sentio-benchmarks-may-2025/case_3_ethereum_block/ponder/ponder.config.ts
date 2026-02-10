import { createConfig } from "ponder";
import { http } from "viem";

export default createConfig({
  networks: {
    mainnet: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  blocks: {
    EveryBlock: {
      network: "mainnet",
      startBlock: 0,
      endBlock: 100000,
    }
  },
});
