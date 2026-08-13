import { createConfig } from "ponder";
import { http } from "viem";

import { ERC20Abi } from "./abis/ERC20";

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

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      // A transport rather than a bare URL, so the calls this case makes can be
      // batched: viem collects the JSON-RPC requests issued in the same tick
      // into one HTTP request. Ponder prefetches the reads for upcoming events,
      // so there are several in flight at a time for batching to collect, and
      // sending each as its own request would put the client's socket handling
      // in front of the round trip it is waiting on.
      //
      // Batching is not aggregation: each allowance read is still its own
      // `eth_call` at its own block, which is what the endpoint holds for
      // 200ms and counts.
      rpc: http(process.env.PONDER_RPC_URL_1!, {
        batch: { batchSize: 1_000, wait: 0 },
      }),
    },
  },
  contracts: {
    ERC20: {
      chain: "mainnet",
      abi: ERC20Abi,
      // One contract entry with eight addresses: the case indexes the same
      // event, decoded the same way, on all of them.
      address: [
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
        "0x68749665ff8d2d112fa859aa293f07a622782f38", // XAUt
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
        "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", // USDe
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
        "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
        "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e", // crvUSD
      ],
      startBlock: 25600000,
      endBlock: requireEndBlock(),
    },
  },
});
