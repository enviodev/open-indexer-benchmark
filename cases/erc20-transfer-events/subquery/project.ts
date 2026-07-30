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
  name: "erc20-transfer-events",
  description:
    "SubQuery indexer for raw ERC20 Transfer events on USDC",
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
      startBlock: 18600000,
      endBlock: requireEndBlock(),
      options: {
        abi: "erc20",
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
      assets: new Map([["erc20", { file: "./abis/erc20.abi.json" }]]),
      mapping: {
        file: "./dist/index.js",
        handlers: [
          {
            kind: EthereumHandlerKind.Event,
            handler: "handleTransfer",
            filter: {
              topics: [
                "Transfer(address indexed from, address indexed to, uint256 value)",
              ],
            },
          },
        ],
      },
    },
  ],
};

export default project;
