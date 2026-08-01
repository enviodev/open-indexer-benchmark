// The indexers the benchmark knows how to drive, and how each is presented.

import type { DriverFactory } from "./common.ts";
import { envioDriver } from "./envio.ts";
import { ponderDriver } from "./ponder.ts";
import { rindexerDriver } from "./rindexer.ts";
import { sqdDriver } from "./sqd.ts";
import { subgraphDriver } from "./subgraph.ts";
import { subqueryDriver } from "./subquery.ts";

export { BENCHMARK_PORT } from "./common.ts";
export type { Ctx, Driver, DriverFactory, Snapshot } from "./common.ts";

export const DRIVERS: Record<string, DriverFactory> = {
  envio: envioDriver("hypersync"),
  "envio-rpc": envioDriver("rpc"),
  ponder: ponderDriver,
  rindexer: rindexerDriver,
  subgraph: subgraphDriver,
  subquery: subqueryDriver,
  sqd: sqdDriver,
};

export const INDEXERS = Object.keys(DRIVERS);

const HYPERSYNC_URL = "https://docs.envio.dev/docs/HyperSync/overview";
const HYPERRPC_URL = "https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc";
const SQD_NETWORK_URL = "https://docs.sqd.ai/subsquid-network/overview/";

/**
 * Which network each tool reads chain data from, and where to link it. Tools
 * without their own data source read from Envio HyperRPC, so the source column
 * distinguishes a tool's own pipeline from a plain RPC endpoint.
 */
export const TOOLS: Record<
  keyof typeof DRIVERS,
  { toolUrl: string; source: string; sourceUrl: string; storage: string }
> = {
  envio: {
    toolUrl: "https://envio.dev",
    source: "HyperSync",
    sourceUrl: HYPERSYNC_URL,
    storage: "Postgres",
  },
  "envio-rpc": {
    toolUrl: "https://envio.dev",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  ponder: {
    toolUrl: "https://ponder.sh",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  rindexer: {
    toolUrl: "https://rindexer.xyz",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  subgraph: {
    toolUrl: "https://thegraph.com",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  sqd: {
    toolUrl: "https://www.sqd.ai",
    source: "SQD",
    sourceUrl: SQD_NETWORK_URL,
    storage: "Postgres",
  },
  subquery: {
    toolUrl: "https://subquery.network",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
};
