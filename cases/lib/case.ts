import type { DecodedLog } from "./hypersync.ts";
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
  contract: string;
  startBlock: number;
  /**
   * Inclusive end block of the bounded verification run. Sized so the slowest
   * indexer still finishes within the phase timeout.
   */
  verifyEndBlock: number;
  /** Event topic0 values the case indexes. */
  topics: string[];
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
