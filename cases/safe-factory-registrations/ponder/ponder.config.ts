import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";

import { SafeAbi, SafeProxyFactoryAbi } from "./abis/Safe";

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

const SAFE_PROXY_FACTORY = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
const START_BLOCK = 24600000;

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1!,
    },
  },
  contracts: {
    SafeProxyFactory: {
      chain: "mainnet",
      abi: SafeProxyFactoryAbi,
      address: SAFE_PROXY_FACTORY,
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
    },
    // Ponder resolves the child address set from the factory's logs before
    // matching child logs, rather than discovering them as it goes.
    Safe: {
      chain: "mainnet",
      abi: SafeAbi,
      address: factory({
        address: SAFE_PROXY_FACTORY,
        event: parseAbiItem("event ProxyCreation(address proxy, address singleton)"),
        parameter: "proxy",
      }),
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
    },
  },
});
