import {
  EthereumProject,
  EthereumDatasourceKind,
  EthereumHandlerKind,
} from "@subql/types-ethereum";

const project: EthereumProject = {
  specVersion: "1.0.0",
  version: "0.0.1",
  name: "erc20-transfer-events",
  description:
    "SubQuery indexer for ERC20 Transfer and Approval events on RocketTokenRETH",
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
      options: {
        abi: "erc20",
        address: "0xae78736cd615f374d3085123a210448e74fc6393",
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
    },
  ],
};

export default project;
