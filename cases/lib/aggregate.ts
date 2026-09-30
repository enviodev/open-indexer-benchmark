// Turns several samples of one benchmark into the one row the table publishes,
// and decides whether that row can be trusted against what is already
// published.
//
// A main run measures every tool more than once, in rounds spread across the
// whole suite, because the rows that swing are the ones reading a remote
// endpoint — and a slow minute on that endpoint slows every sample taken
// during it. Samples half an hour apart do not share that minute, so the
// median of them is a reading of the tool rather than of the endpoint.
//
// The gate is the second line of defence: a row that moved a long way from its
// published value, on a push that did not touch that tool, and whose samples
// do not agree on where it moved to, is measured again before it is published.
//
// Pure functions only, so scripts/test-aggregate.ts can pin every decision
// without a workflow run.

import type { BenchmarkResult } from "./result.ts";
import { formatRate } from "./table.ts";

/**
 * How far a row's median may move from its published value before the gate
 * looks at it. The rows that never touch a remote endpoint stay within 1.5x
 * run to run; the swings this exists for are 5-12x.
 */
export const MOVE_RATIO = 2;

/**
 * How far every sample has to sit on the new side of the published value for
 * a move to count as agreed on. Looser than MOVE_RATIO so a real 2.5x shift
 * with one sample at 1.8x still reads as a shift rather than as noise.
 */
export const AGREE_RATIO = 1.5;

/** The suffix each benchmark job appends to its artifact name. */
const ROUND_SUFFIX = /--(r\d+|recheck)$/;

/**
 * The indexer an artifact's indexer part names, without the round that
 * produced it: "envio-rpc--r2" → "envio-rpc". A name without a suffix passes
 * through unchanged.
 */
export function artifactIndexer(part: string): string {
  return part.replace(ROUND_SUFFIX, "");
}

/**
 * The middle value, or the lower of the two middles on an even count, so the
 * result is always one of the inputs rather than an average none of them was.
 */
function lowerMedian<T>(items: T[], value: (item: T) => number): T {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

const CORRECTNESS_RANK: Record<BenchmarkResult["correctness"], number> = {
  ok: 0,
  unknown: 1,
  mismatch: 2,
};

/**
 * The sample the table publishes. Rate, blocks/s and storage all come from
 * one real run so the row stays internally consistent; with an even count the
 * lower of the two middle samples is taken, so every published number is one
 * a run actually produced rather than an average no run did.
 *
 * Correctness is the exception: it is the worst any sample reported. Data that
 * came out wrong once is a finding about the tool, not noise to vote away.
 */
export function pickMedian(samples: BenchmarkResult[]): BenchmarkResult {
  if (samples.length === 0) throw new Error("pickMedian needs at least one sample");
  const median = lowerMedian(samples, (s) => s.eventsPerSec);

  const worst = samples.reduce((a, b) =>
    CORRECTNESS_RANK[b.correctness] > CORRECTNESS_RANK[a.correctness] ? b : a
  );
  if (CORRECTNESS_RANK[worst.correctness] <= CORRECTNESS_RANK[median.correctness]) {
    return median;
  }
  // The detail reads the same as a single run's would, since it ends up in the
  // README; how many of the runs it came from is the run's business.
  return {
    ...median,
    correctness: worst.correctness,
    correctnessDetail: worst.correctnessDetail,
  };
}

export type Verdict =
  /** Publish the median as it is. */
  | { kind: "publish" }
  /** Moved a long way and every sample agrees: a real change. */
  | { kind: "shift"; from: number; to: number }
  /** Moved a long way and the samples disagree: measure it again. */
  | { kind: "recheck"; from: number; to: number }
  /** Still disagreeing after the recheck: publish, and say so under the table. */
  | { kind: "unstable"; note: string };

export interface GateInput {
  /** events/s of every sample of this row, rechecks included. */
  samples: number[];
  /** events/s currently published for this row, or null if it has none. */
  published: number | null;
  /** The push changed this tool's code, so a move is expected. */
  touched: boolean;
  /**
   * The last look: a recheck has already run (or was never going to), so a
   * row that still disagrees is published with a note rather than rechecked.
   */
  final: boolean;
}

/**
 * Whether a row's fresh median can be published against what the table holds.
 * Every "publish" and "shift" publishes the median; the other two only differ
 * in what happens around it.
 */
export function judge({ samples, published, touched, final }: GateInput): Verdict {
  if (touched || published === null || !(published > 0) || samples.length === 0) {
    return { kind: "publish" };
  }
  const median = lowerMedian(samples, (s) => s);
  if (!(median > 0)) return { kind: "publish" };

  const ratio = Math.max(median, published) / Math.min(median, published);
  if (ratio <= MOVE_RATIO) return { kind: "publish" };

  // One sample is no agreement, however far it moved: it is exactly the
  // reading this gate exists to double-check.
  const up = median > published;
  const agreed =
    samples.length >= 2 &&
    samples.every((s) => (up ? s >= published * AGREE_RATIO : s <= published / AGREE_RATIO));
  if (agreed) return { kind: "shift", from: published, to: median };

  if (!final) return { kind: "recheck", from: published, to: median };

  const min = Math.min(...samples);
  const max = Math.max(...samples);
  return {
    kind: "unstable",
    note:
      `${samples.length} runs ranged ${formatRate(min)}–${formatRate(max)} events/s ` +
      `against ${formatRate(published)} last published; the median is shown`,
  };
}
