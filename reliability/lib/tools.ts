// Which tools the reliability suite can run, and why it cannot run the others.
//
// The scenarios work by lying to an indexer about a chain, which is only
// possible where the benchmark is what the indexer is listening to. Every tool
// reading plain RPC qualifies, and each of them is run here. A tool reading its
// own network — HyperSync, SQD Network — does not: the benchmark cannot make
// either of those serve a nine-block reorg on request, and pointing the tool at
// the mock endpoint instead would measure its RPC path while labelling it as
// the other one.
//
// So the exclusions are listed rather than left implicit. A tool missing from a
// table is indistinguishable from a tool whose job failed, and "we cannot mock
// that source" is a fact about the benchmark rather than a finding about the
// tool.

import { DRIVERS, TOOLS } from "../../cases/lib/drivers/index.ts";

/**
 * Every driver that reads plain RPC and has a project in this directory, in
 * the order its rows are published. These are the reliability suite's rows.
 *
 * A tool needs both to appear here: an RPC path the mock chain can serve, and
 * an implementation of the reliability case for its framework. The second half
 * is why this list is shorter than the first: see AWAITING_PROJECT.
 */
export const RELIABILITY_TOOLS = ["envio-rpc", "ponder"] as const;

/**
 * Drivers that read plain RPC and are waiting only on an implementation of the
 * reliability case for their framework — the project directory the driver
 * looks for, beside reliability/ponder and reliability/envio.
 *
 * Kept apart from NOT_RUN because the two are different statements. NOT_RUN is
 * a fact about the benchmark that will not change: the mock chain cannot serve
 * HyperSync or SQD Network, so those rows cannot exist. This is a list of work
 * to do, and every entry here is a row the suite is supposed to have.
 *
 * Adding a project is the whole of what it takes to move a tool across: the
 * drivers, the scenarios, the scoring and the table are already common.
 */
export const AWAITING_PROJECT: Record<string, string> = {
  "envio-subgraph-rpc":
    "the reliability case has no subgraph/ project yet, which is what this row " +
    "would run on HyperIndex",
  rindexer: "the reliability case has no rindexer/ project yet",
  "sqd-rpc": "the reliability case has no sqd/ project yet",
  subgraph: "the reliability case has no subgraph/ project yet",
  subquery: "the reliability case has no subquery/ project yet",
};

/** Drivers that cannot be run here at all, and the reason, published as a note. */
export const NOT_RUN: Record<string, string> = {
  envio:
    "reads HyperSync, which the benchmark cannot make reorg or fail on demand; " +
    "the Envio Indexer's RPC row is measured instead",
  "envio-subgraph":
    "reads HyperSync, which the benchmark cannot make reorg or fail on demand; " +
    "the Envio Subgraph's RPC row is measured instead",
  "rindexer-hypersync":
    "reads HyperSync, which the benchmark cannot make reorg or fail on demand; " +
    "Rindexer's RPC row is measured instead",
  sqd:
    "reads SQD Network, which the benchmark cannot make reorg or fail on demand; " +
    "the Squid SDK's RPC row is measured instead",
  substreams:
    "reads a StreamingFast endpoint rather than plain RPC, which the benchmark " +
    "cannot make reorg or fail on demand",
  // Carbon does read plain RPC, but Solana's, and the generated chain is an
  // Ethereum JSON-RPC node: it has no slots, no leader schedule and no
  // account model to lie about. A Solana chain to provoke would be a second
  // mock rather than an entry in this list.
  carbon:
    "indexes Solana, and the generated chain is an Ethereum node; provoking a " +
    "Solana indexer needs a Solana chain to provoke",
};

export type ReliabilityTool = (typeof RELIABILITY_TOOLS)[number];

/** True for a driver this suite runs. */
export function runsHere(driver: string): driver is ReliabilityTool {
  return (RELIABILITY_TOOLS as readonly string[]).includes(driver);
}

/**
 * Every registered driver is either run or explained. Called by the suite's
 * tests and by the runner before it starts anything, so a driver added to the
 * throughput registry cannot quietly go unmentioned here — which would read,
 * in the published table, as a tool nobody thought to measure.
 */
export function unaccountedDrivers(): string[] {
  return Object.keys(DRIVERS).filter(
    (driver) => !runsHere(driver) && !NOT_RUN[driver] && !AWAITING_PROJECT[driver]
  );
}

/** Why a tool has no row, or null when it has one. */
export function absenceReason(driver: string): string | null {
  if (runsHere(driver)) return null;
  return NOT_RUN[driver] ?? AWAITING_PROJECT[driver] ?? null;
}

/** How a row is labelled, borrowed wholesale from the throughput tables. */
export function presentation(driver: ReliabilityTool) {
  return TOOLS[driver];
}
