import { createConfig } from "ponder";

import { ERC20Abi } from "./abis/ERC20";

// The reliability harness always supplies an end block, the same way the
// throughput runner does. It is a block no scenario reaches — the suite is
// about what happens at the head — so this project runs as an open-ended head
// follower. The variable is still required rather than defaulted: an indexer
// silently running unbounded looks exactly like a working one.
function requireEndBlock(): number {
  const value = Number(process.env.PONDER_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "PONDER_END_BLOCK must be set to the block to stop at (the harness sets it)"
    );
  }
  return value;
}

export default createConfig({
  chains: {
    mainnet: {
      // The mock chain answers as mainnet, because several tools treat an
      // unknown chain id as a configuration error rather than as a chain.
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1!,
    },
  },
  contracts: {
    ERC20: {
      chain: "mainnet",
      abi: ERC20Abi,
      address: "0x0000000000000000000000000000000000c0ffee",
      startBlock: 1_000_000,
      endBlock: requireEndBlock(),
    },
  },
});
