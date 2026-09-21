import {
  EthereumProject,
  EthereumDatasourceKind,
  EthereumHandlerKind,
} from "@subql/types-ethereum";

// The harness always supplies an end block, the same way the throughput runner
// does. It is a block no scenario reaches — the suite is about what happens at
// the head — so this runs as an open-ended head follower. The variable is
// still required rather than defaulted: a node silently running unbounded
// looks exactly like a working one.
function requireEndBlock(): number {
  const value = Number(process.env.SUBQUERY_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "SUBQUERY_END_BLOCK must be set to the block to stop at (the harness sets it)"
    );
  }
  return value;
}

const project: EthereumProject = {
  specVersion: "1.0.0",
  version: "0.0.1",
  name: "reliability",
  description:
    "The reliability case: transfers, balances and a token read, over a generated chain",
  runner: {
    node: { name: "@subql/node-ethereum", version: ">=3.0.0" },
    query: { name: "@subql/query", version: "*" },
  },
  schema: { file: "./schema.graphql" },
  network: {
    // The generated chain answers as mainnet: several tools treat an unknown
    // chain id as a configuration error rather than as a chain.
    chainId: "1",
    endpoint: [process.env.ETHEREUM_RPC_URL!],
  },
  dataSources: [
    {
      kind: EthereumDatasourceKind.Runtime,
      startBlock: 1000000,
      endBlock: requireEndBlock(),
      options: {
        abi: "erc20",
        address: "0x00000000000000000000000000000000000c0ffee",
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
