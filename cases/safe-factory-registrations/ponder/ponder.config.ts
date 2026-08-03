import { createConfig, factory } from "ponder";
import { parseAbiItem } from "viem";

import { SafeAbi, SafeProxyFactoryAbi, SafeProxyFactoryModernAbi } from "./abis/Safe";

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

// The canonical Safe proxy factories, grouped by how ProxyCreation is laid
// out: 1.3.0 carries `proxy` in the data payload, 1.4.1 onwards carries it in
// a topic. The signature — and so the topic0 — is the same for both.
const FACTORIES_V1_3_0 = [
  "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", // canonical
  "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC", // eip155
] as const;
const FACTORIES_MODERN = [
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", // 1.4.1
  "0x14F2982D601c9458F93bd70B218933A6f8165e7b", // 1.5.0
] as const;

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
      address: [...FACTORIES_V1_3_0],
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
    },
    SafeProxyFactoryModern: {
      chain: "mainnet",
      abi: SafeProxyFactoryModernAbi,
      address: [...FACTORIES_MODERN],
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
    },
    // Ponder resolves the child address set from the factory's logs before
    // matching child logs, rather than discovering them as it goes. A
    // `factory()` reads one event layout, so the children of each generation
    // are declared separately and both write to the same table.
    Safe: {
      chain: "mainnet",
      abi: SafeAbi,
      address: factory({
        address: [...FACTORIES_V1_3_0],
        event: parseAbiItem("event ProxyCreation(address proxy, address singleton)"),
        parameter: "proxy",
      }),
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
    },
    SafeModern: {
      chain: "mainnet",
      abi: SafeAbi,
      address: factory({
        address: [...FACTORIES_MODERN],
        event: parseAbiItem("event ProxyCreation(address indexed proxy, address singleton)"),
        parameter: "proxy",
      }),
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
    },
  },
});
