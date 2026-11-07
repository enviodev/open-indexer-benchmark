import {
  EthereumProject,
  EthereumDatasourceKind,
  EthereumHandlerKind,
} from "@subql/types-ethereum";

// The benchmark runner always supplies an end block; without one the indexer
// would silently run unbounded and the verification phase would never finish.
function requireEndBlock(): number {
  const value = Number(process.env.SUBQUERY_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "SUBQUERY_END_BLOCK must be set to the block to stop at (the benchmark runner sets it)"
    );
  }
  return value;
}

const project: EthereumProject = {
  specVersion: "1.0.0",
  version: "0.0.1",
  name: "uniswap-hourly-snapshots",
  description: "SubQuery indexer for hourly snapshots of a Uniswap V3 pool",
  runner: {
    node: {
      name: "@subql/node-ethereum",
      version: ">=3.0.0",
    },
    query: {
      name: "@subql/query",
      version: "*",
    },
  },
  schema: {
    file: "./schema.graphql",
  },
  network: {
    chainId: "1",
    endpoint: [process.env.ETHEREUM_RPC_URL!],
  },
  dataSources: [
    {
      kind: EthereumDatasourceKind.Runtime,
      startBlock: 21000000,
      endBlock: requireEndBlock(),
      options: {
        abi: "UniswapV3Pool",
        address: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8", // USDC/WETH 0.3%
      },
      assets: new Map([["UniswapV3Pool", { file: "./abis/UniswapV3Pool.json" }]]),
      mapping: {
        file: "./dist/index.js",
        handlers: [
          {
            kind: EthereumHandlerKind.Event,
            handler: "handleSwap",
            filter: {
              topics: [
                "Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
              ],
            },
          },
          // No filter: runs on every block.
          {
            kind: EthereumHandlerKind.Block,
            handler: "handleBlock",
          },
        ],
      },
    },
  ],
};

export default project;
