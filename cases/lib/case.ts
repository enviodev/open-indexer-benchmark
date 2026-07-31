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

  /** Ponder tables whose row counts sum to the processed-event count. */
  ponderTables: string[];
  /** PostGraphile collection fields exposed by rindexer. */
  rindexerCollections: string[];
  /** SubQuery entity collections exposing totalCount. */
  subqueryCollections: string[];
  /** Graph Node entity tables whose row counts sum to the processed-event count. */
  subgraphTables: string[];
  /** Sqd connection fields exposing totalCount. */
  sqdConnections: string[];
}
