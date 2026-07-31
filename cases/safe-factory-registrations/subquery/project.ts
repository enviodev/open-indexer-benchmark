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

const SAFE_PROXY_FACTORY = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
const START_BLOCK = 24600000;

const project: EthereumProject = {
  specVersion: "1.0.0",
  version: "0.0.1",
  name: "safe-factory-registrations",
  description:
    "SubQuery indexer for Safe proxy factory registrations on Ethereum Mainnet",
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
      startBlock: START_BLOCK,
      endBlock: requireEndBlock(),
      options: {
        abi: "safeProxyFactory",
        address: SAFE_PROXY_FACTORY,
      },
      assets: new Map([
        ["safeProxyFactory", { file: "./abis/safeProxyFactory.abi.json" }],
      ]),
      mapping: {
        file: "./dist/index.js",
        handlers: [
          {
            kind: EthereumHandlerKind.Event,
            handler: "handleProxyCreation",
            filter: {
              topics: ["ProxyCreation(address proxy, address singleton)"],
            },
          },
        ],
      },
    },
  ],
  // Instantiated per proxy from the handler above via createDynamicDatasource.
  // A template carries no address of its own; the address is supplied when the
  // factory event that announced the proxy is processed.
  templates: [
    {
      kind: EthereumDatasourceKind.Runtime,
      name: "Safe",
      options: {
        abi: "safe",
      },
      assets: new Map([["safe", { file: "./abis/safe.abi.json" }]]),
      mapping: {
        file: "./dist/index.js",
        handlers: [
          {
            kind: EthereumHandlerKind.Event,
            handler: "handleSafeSetup",
            filter: {
              topics: [
                "SafeSetup(address indexed initiator, address[] owners, uint256 threshold, address initializer, address fallbackHandler)",
              ],
            },
          },
        ],
      },
    },
  ],
};

export default project;
