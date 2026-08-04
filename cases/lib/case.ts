import {
  fetchFactoryLogs,
  fetchLogs,
  type DecodedLog,
  type FetchProgress,
} from "./hypersync.ts";
import type { EntitySpec } from "./checksum.ts";

export interface ExpectedData {
  totalEvents: number;
  /** Canonical rows per entity key, in the encoding the checksum hashes. */
  entities: Record<string, string[]>;
}

export interface CaseConfig {
  /** Directory name under cases/, e.g. "erc20-transfer-events". */
  name: string;
  /** Human-readable case name used in headings. */
  title: string;
  /** Absolute path to the case directory. */
  dir: string;
  /**
   * The contract the case indexes. A factory case may list several — different
   * deployments of the same protocol, which the ground truth reads together.
   */
  contract: string | string[];
  startBlock: number;
  /**
   * Inclusive end block of the bounded verification run. Size it by what the
   * case has to demonstrate rather than by what the slowest indexer can reach:
   * a run that hits the phase timeout is still verified and published, over the
   * share of the range it covered.
   */
  verifyEndBlock: number;
  /**
   * Inclusive end block of the throughput window, when the default — as far
   * towards the chain head as anything could get — would measure the wrong
   * thing. Pin it where a case's events are concentrated, so the window
   * measures work rather than the cost of scanning past empty blocks. The
   * fastest indexer may then reach it before the window closes, which is fine:
   * its rate is computed over the time it took.
   */
  throughputEndBlock?: number;
  /** Event topic0 values the case indexes on `contract`. */
  topics: string[];
  /**
   * Set for a factory case: `contract` is then the factory, and these are the
   * topics indexed on the child contracts it announces. `childOf` names the
   * child a factory log created, so the ground truth can be built in two
   * passes without the case having to know how HyperSync is queried.
   */
  child?: {
    topics: string[];
    childOf: (log: DecodedLog) => string;
  };
  /**
   * Tools that cannot express this case at all, keyed by driver name, with the
   * reason. They are skipped rather than run, and published as a row of dashes
   * carrying the reason as a numbered note — a tool that cannot do something
   * should be visible in the table, not quietly absent from it.
   */
  unsupported?: Record<string, string>;
  /** Entities checked against the ground truth. */
  entities: EntitySpec[];
  /** Replays the case logic over raw logs to produce the expected rows. */
  computeExpected(logs: DecodedLog[]): ExpectedData;

  /**
   * Keys of the entities that hold one row per processed event, so their row
   * counts sum to the number of events an indexer has got through. Aggregated
   * entities (a balance, an allowance) are deliberately excluded: they collapse
   * many events into one row and would understate progress.
   *
   * The tables backing them are found by introspection from the same
   * `tableCandidates`, so this stays one list rather than one per indexer.
   */
  eventEntities: string[];
}

/**
 * Every log a case's ground truth is built from, in the order an indexer would
 * see them. A factory case reads in two passes — the factory, then the children
 * it announced — and a plain case reads one contract; callers should not have
 * to care which, so both the runner and the ground-truth generator come
 * through here.
 */
export function fetchCaseLogs(
  config: CaseConfig,
  token: string,
  onProgress?: (progress: FetchProgress) => void
): Promise<DecodedLog[]> {
  const range = {
    token,
    fromBlock: config.startBlock,
    toBlock: config.verifyEndBlock,
    onProgress,
  };
  return config.child
    ? fetchFactoryLogs({
        ...range,
        factory: config.contract,
        factoryTopics: config.topics,
        childTopics: config.child.topics,
        childOf: config.child.childOf,
      })
    : fetchLogs({ ...range, address: config.contract, topics: config.topics });
}
