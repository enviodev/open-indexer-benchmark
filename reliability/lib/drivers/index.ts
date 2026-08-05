// The tools the reliability suite can drive, and how each is presented.
//
// A tool is here only if it can be pointed at an arbitrary JSON-RPC endpoint.
// That is not a judgement about the tools that cannot: it is the mock chain's
// limitation. Reliability is measured by taking the chain apart on purpose, and
// a tool reading a real network cannot be shown a chain that reorganises on
// command.

import { envioDriver } from "./envio.ts";
import { ponderDriver } from "./ponder.ts";
import { rindexerDriver } from "./rindexer.ts";
import { subgraphDriver } from "./subgraph.ts";
import { subqueryDriver } from "./subquery.ts";
import type { DriverFactory } from "./common.ts";

export type { DriverContext, ReliabilityDriver } from "./common.ts";

export const DRIVERS: Record<string, DriverFactory> = {
  envio: envioDriver,
  ponder: ponderDriver,
  rindexer: rindexerDriver,
  subgraph: subgraphDriver,
  subquery: subqueryDriver,
};

export const TOOLS = Object.keys(DRIVERS);

export interface ToolInfo {
  name: string;
  url: string;
  /** Project directory under reliability/ and database inside the shared server. */
  dir: string;
  database: string;
}

export const TOOL_INFO: Record<string, ToolInfo> = {
  envio: {
    name: "Envio Indexer",
    url: "https://envio.dev",
    dir: "envio",
    database: "rel_envio",
  },
  ponder: {
    name: "Ponder",
    url: "https://ponder.sh",
    dir: "ponder",
    database: "rel_ponder",
  },
  rindexer: {
    name: "Rindexer",
    url: "https://rindexer.xyz",
    dir: "rindexer",
    database: "rel_rindexer",
  },
  subgraph: {
    name: "Subgraph",
    url: "https://thegraph.com",
    dir: "subgraph",
    database: "rel_subgraph",
  },
  subquery: {
    name: "SubQuery",
    url: "https://subquery.network",
    dir: "subquery",
    database: "rel_subquery",
  },
};

/**
 * Tools the throughput benchmark covers that the reliability suite cannot,
 * published as a row of dashes rather than left out — a gap in coverage that is
 * invisible looks like a gap in the tool.
 */
export const OUT_OF_SCOPE: Record<string, string> = {
  "envio-hypersync":
    "reads HyperSync rather than an RPC endpoint, so it cannot be pointed at the mock chain; " +
    "the Envio row below runs the same indexer with RPC as its sync source",
  sqd: "reads the SQD network rather than an RPC endpoint, so it cannot be pointed at the mock chain",
};
