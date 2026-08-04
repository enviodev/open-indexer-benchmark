// The shape a benchmark run reports, and how it renders into a table row.
//
// Kept apart from the runner so the CI summary job can turn recorded results
// into tables without importing every driver — and without the process-level
// signal handlers the runner installs to tear down containers.

import { formatBytes, formatRate, type TableRow } from "./table.ts";
import type { Verification } from "./verify.ts";

export interface BenchmarkResult {
  name: string;
  /** Project page for the tool. */
  toolUrl: string;
  /** Chain data source the tool ingested from. */
  source: string;
  sourceUrl: string;
  /** Storage engine the measured size belongs to. */
  storage: string;
  blocksPerSec: number;
  eventsPerSec: number;
  /** Which phase the rate came from. */
  throughputSource: "window" | "range";
  correctness: Verification["status"];
  correctnessDetail: string;
  /** Size of the entity tables the indexer produced. */
  dbSizeBytes: number | null;
  /** Whole-database size, including each indexer's internal bookkeeping. */
  dbTotalBytes: number | null;
  /** Seconds taken to index the verification range, if it completed. */
  rangeSeconds: number | null;
  /** Length of the throughput window that produced the reported rate. */
  windowSeconds: number | null;
  /** Every throughput window run, for transparency about run-to-run spread. */
  windowRuns?: { eventsPerSec: number; blocksPerSec: number; seconds: number }[];
  /**
   * Why the tool cannot express this case. Present only for tools the case
   * declares unsupported — they are never run, so every metric above is zero
   * and must not be read as a measurement.
   */
  unsupported?: string;
}

/** Status marker only; the explanation becomes a note under the table. */
function correctnessCell(result: BenchmarkResult): string {
  if (result.correctness === "ok") return "✅";
  return result.correctness === "mismatch" ? "❌" : "❓";
}

export function toTableRow(result: BenchmarkResult): TableRow {
  const size = formatBytes(result.dbSizeBytes);
  return {
    name: result.name,
    eventsPerSec: result.eventsPerSec,
    ...(result.unsupported ? { unsupported: result.unsupported } : {}),
    cells: {
      tool: `[${result.name}](${result.toolUrl})`,
      source: `[${result.source}](${result.sourceUrl})`,
      blocks: formatRate(result.blocksPerSec),
      events: formatRate(result.eventsPerSec),
      correctness: correctnessCell(result),
      correctnessDetail: result.correctness === "ok" ? "" : result.correctnessDetail,
      dbSize: size === "—" ? size : `${result.storage} ${size}`,
    },
  };
}
