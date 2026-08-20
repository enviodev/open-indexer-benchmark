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
import { TOOLS as BENCHMARK_TOOLS } from "../../../cases/lib/drivers/index.ts";
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
  /** Project directory under reliability/, and the database it writes to. */
  dir: string;
  database: string;
  /**
   * The throughput benchmark's tool keys this row stands in for.
   *
   * The benchmark measures a tool once per data source it supports; the
   * reliability suite measures the tool once, over RPC, because that is the
   * only source a chain generated in this process can be served through. The
   * write path, the reorg unwinding and the restart recovery are the same code
   * whichever source fed them, so one row answers for all of that tool's rows —
   * and saying which ones is what lets the coverage gap below be derived rather
   * than remembered.
   */
  covers: string[];
}

export const TOOL_INFO: Record<string, ToolInfo> = {
  envio: {
    name: "Envio Indexer",
    url: "https://envio.dev",
    dir: "envio",
    database: "rel_envio",
    covers: ["envio", "envio-rpc"],
  },
  ponder: {
    name: "Ponder",
    url: "https://ponder.sh",
    dir: "ponder",
    database: "rel_ponder",
    covers: ["ponder"],
  },
  rindexer: {
    name: "Rindexer",
    url: "https://rindexer.xyz",
    dir: "rindexer",
    database: "rel_rindexer",
    covers: ["rindexer", "rindexer-hypersync"],
  },
  subgraph: {
    name: "Subgraph",
    url: "https://thegraph.com",
    dir: "subgraph",
    database: "rel_subgraph",
    covers: ["subgraph"],
  },
  subquery: {
    name: "SubQuery",
    url: "https://subquery.network",
    dir: "subquery",
    database: "rel_subquery",
    covers: ["subquery"],
  },
};

/**
 * Every benchmark tool this suite does not run, and why, worked out from the
 * benchmark's own registry rather than listed here.
 *
 * Listing them by hand did not survive its first contact with `main`: four new
 * variants landed, two of them RPC-only, and the published note went on saying
 * the Squid SDK "cannot be pointed at the mock chain" after `sqd-rpc` had made
 * that untrue. A coverage gap that is invisible looks like a gap in the tool,
 * and one that is stale is worse — it is a claim about a tool that is wrong.
 *
 * So a variant added to the benchmark now shows up here on its own, as one of
 * two things: a source that cannot be mocked, or a tool nobody has written a
 * reliability driver for yet. Both are published as a row of dashes carrying
 * the reason.
 */
export function outOfScope(): Record<string, string> {
  const covered = new Set(
    Object.values(TOOL_INFO).flatMap((info) => info.covers)
  );
  const gaps: Record<string, string> = {};

  for (const [key, tool] of Object.entries(BENCHMARK_TOOLS)) {
    if (covered.has(key)) continue;
    gaps[key] =
      tool.source === "RPC"
        ? `${tool.name} over RPC could be measured here, but has no reliability ` +
          `driver yet; see "Adding a tool" in reliability/README.md`
        : `reads ${tool.source} rather than an RPC endpoint, so it cannot be ` +
          `pointed at a chain that only exists inside this process`;
  }
  return gaps;
}
