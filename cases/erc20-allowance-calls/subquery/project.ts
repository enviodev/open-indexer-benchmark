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

/** The eight tokens the case indexes approvals on. */
const TOKENS = [
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  "0x68749665ff8d2d112fa859aa293f07a622782f38", // XAUt
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3", // USDe
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e", // crvUSD
];

const project: EthereumProject = {
  specVersion: "1.0.0",
  version: "0.0.1",
  name: "erc20-allowance-calls",
  description:
    "SubQuery indexer for ERC20 approvals, reading each resulting allowance from the chain",
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
  // A data source takes one address, so the eight tokens are eight data
  // sources over the same handler and ABI.
  dataSources: TOKENS.map((address) => ({
    kind: EthereumDatasourceKind.Runtime,
    startBlock: 25600000,
    endBlock: requireEndBlock(),
    options: {
      abi: "erc20",
      address,
    },
    assets: new Map([["erc20", { file: "./abis/erc20.abi.json" }]]),
    mapping: {
      file: "./dist/index.js",
      handlers: [
        {
          kind: EthereumHandlerKind.Event,
          handler: "handleApproval",
          filter: {
            topics: [
              "Approval(address indexed owner, address indexed spender, uint256 value)",
            ],
          },
        },
      ],
    },
  })),
};

export default project;
