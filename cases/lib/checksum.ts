// Ground-truth verification without a golden dataset.
//
// Instead of committing every expected row, each entity is reduced to a
// (rowCount, checksum) pair. The checksum hashes a canonical text encoding of
// every row and sums the hashes, so it is independent of row order but still
// sensitive to missing rows, duplicated rows, and wrong values alike. The same
// encoding is computed twice: once in TypeScript from HyperSync logs (see
// scripts/generate-expected.ts) and once in SQL against the indexer's database
// (see verify.ts). The two must agree exactly.

import { createHash } from "node:crypto";

/** Number of md5 hex characters folded into each row hash (60 bits). */
const HASH_HEX_CHARS = 15;

export type FieldKind = "address" | "amount" | "seconds";

export interface FieldSpec {
  /** Stable name used in messages and in the canonical field ordering. */
  role: string;
  kind: FieldKind;
  /** Possible column names, most specific first. Compared case-insensitively. */
  candidates: string[];
}

export interface EntitySpec {
  /** Key under `entities` in expected.json. */
  key: string;
  /** Human-readable name used in result messages, e.g. "transfer events". */
  label: string;
  /**
   * Singular form, for a count of one. Defaults to `label` minus a trailing
   * "s", which is right for every label in use; set it explicitly for one that
   * strip would mangle ("addresses") rather than teaching the formatter English.
   */
  singular?: string;
  /**
   * Possible table names, most specific first. Compared after normalising
   * (lowercase, underscores stripped) so `TransferEvent`, `transfer_event`
   * and `transfer_events` all match the same candidate.
   */
  tableCandidates: string[];
  /** Canonical field order. Both sides must encode fields in this order. */
  fields: FieldSpec[];
  /**
   * How many leading fields identify a row. Set it when an entity has a
   * natural key, so a differing row is reported as one wrong value instead of
   * a missing row plus an unexpected one. Omit when the whole row is the
   * identity, as for append-only event tables.
   */
  keyFieldCount?: number;
}

export interface EntityExpectation {
  rowCount: number;
  /** Decimal string — the sum exceeds 64 bits for large tables. */
  checksum: string;
}

export interface Expected {
  startBlock: number;
  /** Inclusive. */
  endBlock: number;
  generatedAt: string;
  /** Total events the indexer is expected to process across all entities. */
  totalEvents: number;
  /**
   * The highest block in the range that carries an event, which is not
   * necessarily `endBlock` — the last blocks of a range are often empty.
   *
   * This is what "finished the range" means for a tool whose progress is read
   * from the data it wrote rather than from a position it reports. Such a tool
   * can only ever appear to reach the last block that produced a row, so
   * holding it to `endBlock` calls a completed run partial and hides whatever
   * verification actually found behind a note about the run stopping short.
   *
   * Optional so an `expected.json` generated before this field still loads;
   * without it the target falls back to `endBlock`.
   */
  lastEventBlock?: number;
  entities: Record<string, EntityExpectation>;
}

// ── Canonical value encoding ───────────────────────────────────────────

export function encodeAddress(value: string): string {
  return value.toLowerCase();
}

export function encodeAmount(value: bigint): string {
  return value.toString();
}

export function encodeSeconds(value: number): string {
  return String(value);
}

/** Join already-encoded field values into the canonical row text. */
export function canonicalRow(encodedFields: string[]): string {
  return encodedFields.join("|");
}

/** Hash of a single canonical row, matching the SQL expression in verify.ts. */
export function rowChecksum(canonical: string): bigint {
  const md5 = createHash("md5").update(canonical).digest("hex");
  return BigInt(`0x${md5.slice(0, HASH_HEX_CHARS)}`);
}

/** Reduce a set of canonical rows to the committed (rowCount, checksum) pair. */
export function summarise(rows: string[]): EntityExpectation {
  let checksum = BigInt(0);
  for (const row of rows) checksum += rowChecksum(row);
  return { rowCount: rows.length, checksum: checksum.toString() };
}

/** The canonical row text as SQL, shared by the checksum and the row diff. */
export function canonicalExprSql(fieldExprs: string[]): string {
  return `concat_ws('|', ${fieldExprs.map((e) => `coalesce(${e}, '')`).join(", ")})`;
}

/**
 * Turn a bare predicate into a clause, or nothing when there is none. Callers
 * pass the predicate alone so no one has to remember which half of the
 * statement carries the leading "WHERE".
 */
export function whereClause(predicate: string): string {
  return predicate ? ` WHERE ${predicate}` : "";
}

/**
 * SQL that reproduces `summarise` for a table, given per-field expressions in
 * canonical order. `substr(md5(…), 1, 15)` is read as a 60-bit integer, which
 * always fits a signed bigint; summing bigints yields numeric, so the total
 * never overflows.
 */
export function checksumSql(
  qualifiedTable: string,
  fieldExprs: string[],
  predicate = ""
): string {
  const canonical = canonicalExprSql(fieldExprs);
  return (
    `SELECT count(*)::text, ` +
    `coalesce(sum(('x' || substr(md5(${canonical}), 1, ${HASH_HEX_CHARS}))` +
    `::bit(${HASH_HEX_CHARS * 4})::bigint), 0)::text ` +
    `FROM ${qualifiedTable}${whereClause(predicate)}`
  );
}
