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
 * How each tool is presented: its display name, and which network it reads
 * chain data from and where to link that. Tools without their own data source
 * read from Envio HyperRPC, so the source column distinguishes a tool's own
 * pipeline from a plain RPC endpoint.
 *
 * The name lives here rather than on the driver so a row can be published for a
 * tool the case never starts — and so the two can never disagree.
 */
export const TOOLS: Record<
  keyof typeof DRIVERS,
  { name: string; toolUrl: string; source: string; sourceUrl: string; storage: string }
> = {
  envio: {
    name: "Envio Indexer",
    toolUrl: "https://envio.dev",
    source: "HyperSync",
    sourceUrl: HYPERSYNC_URL,
    storage: "Postgres",
  },
  "envio-rpc": {
    name: "Envio Indexer",
    toolUrl: "https://envio.dev",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  ponder: {
    name: "Ponder",
    toolUrl: "https://ponder.sh",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  rindexer: {
    name: "Rindexer",
    toolUrl: "https://rindexer.xyz",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  subgraph: {
    // The subgraph is what is being benchmarked; Graph Node is the runtime that
    // executes it. The name matches the "Subgraph" column of the May 2025
    // results kept in the root README.
    name: "Subgraph",
    toolUrl: "https://thegraph.com",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  sqd: {
    name: "Sqd",
    toolUrl: "https://www.sqd.ai",
    source: "SQD",
    sourceUrl: SQD_NETWORK_URL,
    storage: "Postgres",
  },
  subquery: {
    name: "SubQuery",
    toolUrl: "https://subquery.network",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
};
