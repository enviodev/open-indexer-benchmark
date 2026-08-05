import {
  EthereumProject,
  EthereumDatasourceKind,
  EthereumHandlerKind,
} from "@subql/types-ethereum";

// Most reliability scenarios follow the head and are ended by the harness, so
// an end block is the exception rather than the rule.
function endBlock(): number | undefined {
  const value = Number(process.env.SUBQUERY_END_BLOCK);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

const project: EthereumProject = {
  specVersion: "1.0.0",
  version: "0.0.1",
  name: "reliability",
  description: "SubQuery indexer for the reliability scenarios' mock chain",
  runner: {
    node: { name: "@subql/node-ethereum", version: ">=3.0.0" },
    query: { name: "@subql/query", version: "*" },
  },
  schema: { file: "./schema.graphql" },
  network: {
    // The mock chain answers as chain 1, so the ordinary mainnet configuration
    // applies unchanged.
    chainId: "1",
    endpoint: [process.env.ETHEREUM_RPC_URL!],
  },
  dataSources: [
    {
      kind: EthereumDatasourceKind.Runtime,
      startBlock: Number(process.env.SUBQUERY_START_BLOCK ?? 1),
      endBlock: endBlock(),
      options: {
        abi: "MockTokenAbi",
        address: "0x5fbdb2315678afecb367f032d93f642f64180aa3",
      },
      assets: new Map([
        ["MockTokenAbi", { file: "./abis/MockToken.abi.json" }],
      ]),
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
            handler: "handleMetadataUpdated",
            filter: { topics: ["MetadataUpdated(string symbol, string name)"] },
          },
        ],
      },
    },
  ],
};

export default project;
