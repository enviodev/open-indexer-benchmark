import { createConfig } from "ponder";

import { MockTokenAbi } from "./abis/MockToken";

// Reliability scenarios follow the head and are ended by the harness, so an end
// block is the exception rather than the rule — unlike the throughput
// benchmark, where one is always supplied.
const endBlock = process.env.PONDER_END_BLOCK
  ? Number(process.env.PONDER_END_BLOCK)
  : undefined;

export default createConfig({
  chains: {
    // The mock chain answers as chain 1 so that every tool's ordinary mainnet
    // configuration applies unchanged, including whatever confirmation depth it
    // assumes — which is part of what the reorg scenario is measuring.
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1!,
    },
  },
  contracts: {
    MockToken: {
      chain: "mainnet",
      abi: MockTokenAbi,
      address: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      startBlock: Number(process.env.PONDER_START_BLOCK ?? 1),
      endBlock,
    },
  },
});
