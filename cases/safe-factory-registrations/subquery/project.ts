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

const START_BLOCK = 24600000;

// The canonical Safe proxy factories. A datasource carries one address, and
// the two generations need different ABIs — `proxy` became indexed in 1.4.1,
// which is the same event signature over a different payload — so each
// deployment gets its own entry.
const FACTORIES_V1_3_0 = [
  "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2", // canonical
  "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC", // eip155
];
const FACTORIES_MODERN = [
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", // 1.4.1
  "0x14F2982D601c9458F93bd70B218933A6f8165e7b", // 1.5.0
];

function factoryDatasource(address: string, modern: boolean) {
  const abi = modern ? "safeProxyFactoryModern" : "safeProxyFactory";
  return {
    kind: EthereumDatasourceKind.Runtime,
    startBlock: START_BLOCK,
    endBlock: requireEndBlock(),
    options: { abi, address },
    assets: new Map([[abi, { file: `./abis/${abi}.abi.json` }]]),
    mapping: {
      file: "./dist/index.js",
      handlers: [
        {
          kind: EthereumHandlerKind.Event,
          handler: modern ? "handleProxyCreationIndexed" : "handleProxyCreation",
          filter: {
            topics: [
              modern
                ? "ProxyCreation(address indexed proxy, address singleton)"
                : "ProxyCreation(address proxy, address singleton)",
            ],
          },
        },
      ],
    },
  };
}

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
    ...FACTORIES_V1_3_0.map((address) => factoryDatasource(address, false)),
    ...FACTORIES_MODERN.map((address) => factoryDatasource(address, true)),
  ],
  // Instantiated per proxy from the handlers above via createDynamicDatasource.
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
