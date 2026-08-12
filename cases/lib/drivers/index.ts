// The indexers the benchmark knows how to drive, and how each is presented.

import type { DriverFactory } from "./common.ts";
import { envioDriver } from "./envio.ts";
import { envioSubgraphDriver } from "./envio-subgraph.ts";
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
  "envio-subgraph": envioSubgraphDriver("hypersync"),
  "envio-subgraph-rpc": envioSubgraphDriver("rpc"),
  ponder: ponderDriver,
  rindexer: rindexerDriver,
  subgraph: subgraphDriver,
  subquery: subqueryDriver,
  sqd: sqdDriver("network"),
  "sqd-rpc": sqdDriver("rpc"),
};

export const INDEXERS = Object.keys(DRIVERS);

const HYPERSYNC_URL = "https://docs.envio.dev/docs/HyperSync/overview";
const HYPERRPC_URL = "https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc";
/** The release the pinned envio comes from, so the row names its own version. */
const ENVIO_SUBGRAPH_URL =
  "https://github.com/enviodev/hyperindex/releases/tag/v3.6.1-subgraph";
const SQD_SDK_URL = "https://sqd.dev/sdk/";
const SQD_NETWORK_URL = "https://docs.sqd.dev/en/network/overview";

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
  // The Subgraph case's own project, indexed by HyperIndex instead of Graph
  // Node. Nothing in that directory changes, so the row is a like-for-like
  // reading of the same subgraph.
  "envio-subgraph": {
    name: "Envio Subgraph",
    toolUrl: ENVIO_SUBGRAPH_URL,
    source: "HyperSync",
    sourceUrl: HYPERSYNC_URL,
    storage: "Postgres",
  },
  "envio-subgraph-rpc": {
    name: "Envio Subgraph",
    toolUrl: ENVIO_SUBGRAPH_URL,
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
    // "Squid SDK" is what SQD — the company, formerly Subsquid — calls the
    // indexing framework this project is built with; SQD Network is the data
    // source it reads from, and both appear in the row.
    name: "Squid SDK",
    toolUrl: SQD_SDK_URL,
    source: "SQD Network",
    sourceUrl: SQD_NETWORK_URL,
    storage: "Postgres",
  },
  "sqd-rpc": {
    name: "Squid SDK",
    toolUrl: SQD_SDK_URL,
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
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
