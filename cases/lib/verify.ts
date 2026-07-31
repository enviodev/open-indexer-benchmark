// Verifies an indexer's database against the committed ground truth, and
// measures the on-disk size of the data it produced.
//
// Every indexer models the same case with a different schema (table naming,
// column naming, storage types), so tables and columns are resolved by
// introspection against per-entity candidate lists rather than hardcoded per
// indexer. When resolution is ambiguous or a column is missing, the result is
// reported as "unknown" with the reason — never as a correctness failure, so a
// schema change in an indexer cannot be mistaken for a data bug.
//
// A checksum tells you that something is wrong but not what, so when an entity
// mismatches the ground-truth rows are rebuilt and diffed against the indexer's
// rows. That turns "the checksum differs" into "512 of 1,747 account balances
// hold the wrong value, for example 0x1234… ".

import {
  canonicalExprSql,
  checksumSql,
  whereClause,
  type EntitySpec,
  type Expected,
  type FieldSpec,
} from "./checksum.ts";

/** Runs a SQL statement and returns psql's `-t -A` output. */
export type SqlRunner = (query: string) => Promise<string>;

export interface VerifyOptions {
  /**
   * Rebuilds the expected rows per entity key, in the same canonical encoding
   * the checksum uses. Called at most once, and only when something mismatched,
   * so the happy path stays a single cheap aggregate per entity.
   */
  fetchExpectedRows?: () => Promise<Record<string, string[]>>;
}

export interface EntityVerification {
  key: string;
  label: string;
  status: "ok" | "mismatch" | "unknown";
  detail: string;
  /** Concrete differing rows, for the run log. */
  examples: string[];
  table?: string;
  expectedRows?: number;
  actualRows?: number;
  sizeBytes?: number;
}

export interface Verification {
  status: "ok" | "mismatch" | "unknown";
  /** Short human-readable summary, e.g. "465 account balances are missing". */
  detail: string;
  entities: EntityVerification[];
  /** Size of the entity tables (data + indexes + TOAST). */
  dbSizeBytes: number | null;
  /** Size of every non-system relation, including internal bookkeeping. */
  dbTotalBytes: number | null;
}

interface ColumnInfo {
  schema: string;
  table: string;
  column: string;
  dataType: string;
  isBaseTable: boolean;
}

interface ResolvedTable {
  schema: string;
  table: string;
  isBaseTable: boolean;
  columns: Map<string, ColumnInfo>;
}

/** A resolved entity: where its rows live and how to encode them. */
interface ResolvedEntity {
  qualified: string;
  displayName: string;
  fieldExprs: string[];
  /** Bare predicate restricting the entity's rows, or "" for all of them. */
  predicate: string;
}

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema"];
const MAX_EXAMPLES = 3;

/**
 * Field and record separators for introspection output. psql's default column
 * separator is "|" and its rows are newline-delimited, either of which a
 * PostgreSQL identifier is allowed to contain; ASCII 0x1f/0x1e are not.
 */
const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

const count = (n: number) => n.toLocaleString("en-US");
/** Entity labels are plural ("account balances"); singularise for a count of one. */
const noun = (n: number, spec: EntitySpec) =>
  n === 1 ? (spec.singular ?? spec.label.replace(/s$/, "")) : spec.label;

/** `transfer_event`, `TransferEvent` and `transferEvents` all normalise alike. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/_/g, "").replace(/s$/, "");
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function introspect(sql: SqlRunner): Promise<ColumnInfo[]> {
  // Assembled server-side into a single value with explicit separators rather
  // than relying on psql's column and row formatting: this is the one layer
  // whose whole job is to cope with whatever names an indexer chose, so it must
  // not be the layer that a "|" in a column name breaks.
  const field = `E'\\x1f'`;
  const rows = await sql(
    `SELECT string_agg(
       c.table_schema || ${field} || c.table_name || ${field} || c.column_name ||
       ${field} || c.data_type || ${field} || t.table_type, E'\\x1e')
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema NOT IN (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(", ")})
       AND c.table_schema NOT LIKE 'pg_%'`
  );
  const out: ColumnInfo[] = [];
  for (const line of rows.split(RECORD_SEP)) {
    if (!line.trim()) continue;
    const [schema, table, column, dataType, tableType] = line.split(FIELD_SEP);
    out.push({
      schema,
      table,
      column,
      dataType,
      isBaseTable: tableType === "BASE TABLE",
    });
  }
  return out;
}

/** Group flat introspection rows into tables. */
function groupTables(columns: ColumnInfo[]): ResolvedTable[] {
  const byTable = new Map<string, ResolvedTable>();
  for (const col of columns) {
    const key = `${col.schema}.${col.table}`;
    let entry = byTable.get(key);
    if (!entry) {
      entry = {
        schema: col.schema,
        table: col.table,
        isBaseTable: col.isBaseTable,
        columns: new Map(),
      };
      byTable.set(key, entry);
    }
    entry.columns.set(col.column.toLowerCase(), col);
  }
  return [...byTable.values()];
}

function findColumn(table: ResolvedTable, field: FieldSpec): ColumnInfo | undefined {
  for (const candidate of field.candidates) {
    const found = table.columns.get(candidate.toLowerCase());
    if (found) return found;
  }
  return undefined;
}

/** Canonical SQL expression for a column, normalising across storage types. */
function fieldExpr(field: FieldSpec, col: ColumnInfo): string {
  const ident = quoteIdent(col.column);
  const type = col.dataType.toLowerCase();
  switch (field.kind) {
    case "address":
      // Ponder stores hex as bytea; everyone else as text.
      return type === "bytea"
        ? `('0x' || encode(${ident}, 'hex'))`
        : `lower(${ident}::text)`;
    case "amount":
      // numeric everywhere except indexers that keep uint256 as a string.
      return `(${ident}::numeric)::text`;
    case "seconds":
      return type.startsWith("timestamp") || type === "date"
        ? `(extract(epoch from ${ident})::bigint)::text`
        : `(${ident}::bigint)::text`;
  }
}

/**
 * Pick the table backing an entity. Candidates are ranked by position in
 * `tableCandidates`; among equally-ranked matches, only those exposing every
 * required field are considered, and anything still ambiguous is rejected
 * rather than guessed at.
 */
function resolveEntity(
  spec: EntitySpec,
  tables: ResolvedTable[]
): ResolvedEntity | { error: string } {
  const candidates = spec.tableCandidates.map(normalise);
  let best: { rank: number; matches: ResolvedTable[] } | null = null;

  for (const table of tables) {
    const rank = candidates.indexOf(normalise(table.table));
    if (rank === -1) continue;
    if (!best || rank < best.rank) best = { rank, matches: [table] };
    else if (rank === best.rank) best.matches.push(table);
  }

  if (!best) {
    return { error: `no table matching ${spec.tableCandidates.join(" / ")}` };
  }

  let matches = best.matches;
  if (matches.length > 1) {
    const complete = matches.filter((t) => spec.fields.every((f) => findColumn(t, f)));
    if (complete.length > 0) matches = complete;
  }
  if (matches.length > 1) {
    const baseTables = matches.filter((t) => t.isBaseTable);
    if (baseTables.length > 0) matches = baseTables;
  }
  if (matches.length > 1) {
    const names = matches.map((t) => `${t.schema}.${t.table}`).join(", ");
    return { error: `ambiguous table for ${spec.key}: ${names}` };
  }

  const table = matches[0];
  const displayName = `${table.schema}.${table.table}`;
  const fieldExprs: string[] = [];
  for (const field of spec.fields) {
    const col = findColumn(table, field);
    if (!col) {
      return {
        error:
          `${displayName} has no column for "${field.role}" ` +
          `(tried ${field.candidates.join(" / ")})`,
      };
    }
    fieldExprs.push(fieldExpr(field, col));
  }

  return {
    qualified: `${quoteIdent(table.schema)}.${quoteIdent(table.table)}`,
    displayName,
    fieldExprs,
    // SubQuery keeps historical entity versions in the same table; restrict to
    // the current version so counts and checksums describe present state. The
    // discarded history still shows up in the measured table size, which is the
    // honest way to report the cost of keeping it.
    predicate: table.columns.has("_block_range") ? "upper_inf(_block_range)" : "",
  };
}

/** Where an entity's rows live, without the per-field encoding. */
export interface EntityTable {
  key: string;
  qualified: string;
  displayName: string;
  /** Bare predicate restricting the entity's rows, or "" for all of them. */
  predicate: string;
}

/**
 * Locate the tables backing the given entities.
 *
 * Shared with the drivers, which read indexing progress straight out of the
 * database and so need the same name resolution — but only the table, not the
 * canonical field expressions. Throws on the first entity that cannot be
 * resolved: a caller that polls progress has no way to report "unknown" the way
 * verification does, and a silently-skipped table would read as an indexer that
 * had processed nothing.
 */
export async function resolveEntityTables(
  sql: SqlRunner,
  specs: EntitySpec[]
): Promise<EntityTable[]> {
  const tables = groupTables(await introspect(sql));
  return specs.map((spec) => {
    const entity = resolveEntity(spec, tables);
    if ("error" in entity) throw new Error(entity.error);
    return {
      key: spec.key,
      qualified: entity.qualified,
      displayName: entity.displayName,
      predicate: entity.predicate,
    };
  });
}

/** Every row of an entity, in the same canonical encoding the checksum hashes. */
async function fetchActualRows(
  sql: SqlRunner,
  entity: ResolvedEntity
): Promise<string[]> {
  const canonical = canonicalExprSql(entity.fieldExprs);
  const out = await sql(
    `SELECT ${canonical} FROM ${entity.qualified}${whereClause(entity.predicate)}`
  );
  return out.split("\n").filter((line) => line.length > 0);
}

interface Diff {
  missing: number;
  unexpected: number;
  wrongValue: number;
  examples: string[];
}

/**
 * Compare actual against expected rows. Rows are keyed on their leading
 * identity fields where the entity has them, so an account whose balance is
 * wrong reads as one wrong value rather than as one missing plus one
 * unexpected row.
 */
function diffRows(spec: EntitySpec, expected: string[], actual: string[]): Diff {
  const keyOf = (row: string) => {
    if (!spec.keyFieldCount) return row;
    return row.split("|").slice(0, spec.keyFieldCount).join("|");
  };

  const groupByKey = (rows: string[]) => {
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const key = keyOf(row);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(row);
      else grouped.set(key, [row]);
    }
    return grouped;
  };
  const expectedByKey = groupByKey(expected);
  const actualByKey = groupByKey(actual);

  let missing = 0;
  let unexpected = 0;
  let wrongValue = 0;
  const examples: string[] = [];

  for (const [key, expectedRows] of expectedByKey) {
    const actualRows = actualByKey.get(key);
    if (!actualRows) {
      missing += expectedRows.length;
      if (examples.length < MAX_EXAMPLES) {
        examples.push(`missing: ${expectedRows[0]}`);
      }
      continue;
    }
    // Same key on both sides: pair them up and report leftovers.
    const remaining = new Map<string, number>();
    for (const row of expectedRows) remaining.set(row, (remaining.get(row) ?? 0) + 1);
    let differing = 0;
    const unpaired: string[] = [];
    for (const row of actualRows) {
      const count = remaining.get(row) ?? 0;
      if (count > 0) {
        remaining.set(row, count - 1);
      } else {
        differing++;
        unpaired.push(row);
      }
    }
    const unmatchedExpected = [...remaining.values()].reduce((a, b) => a + b, 0);
    const paired = Math.min(differing, unmatchedExpected);
    wrongValue += paired;
    unexpected += differing - paired;
    missing += unmatchedExpected - paired;
    if (paired > 0 && examples.length < MAX_EXAMPLES) {
      const want = [...remaining.entries()].find(([, n]) => n > 0)?.[0];
      examples.push(`got ${unpaired[0]}, expected ${want}`);
    }
  }
  for (const [key, actualRows] of actualByKey) {
    if (expectedByKey.has(key)) continue;
    unexpected += actualRows.length;
    if (examples.length < MAX_EXAMPLES) examples.push(`unexpected: ${actualRows[0]}`);
  }

  return { missing, unexpected, wrongValue, examples };
}

/** Plain-language summary of a diff, e.g. "465 of 1,747 account balances are missing". */
function describeDiff(spec: EntitySpec, diff: Diff, expectedTotal: number): string {
  const parts: string[] = [];
  if (diff.missing > 0) {
    parts.push(`${count(diff.missing)} of ${count(expectedTotal)} ${spec.label} missing`);
  }
  if (diff.wrongValue > 0) {
    parts.push(
      `${count(diff.wrongValue)} of ${count(expectedTotal)} ${spec.label} with the wrong value`
    );
  }
  if (diff.unexpected > 0) {
    parts.push(`${count(diff.unexpected)} unexpected ${noun(diff.unexpected, spec)}`);
  }
  return parts.join(" and ");
}

/** Summary used when the ground-truth rows could not be rebuilt. */
function describeCounts(
  spec: EntitySpec,
  actualRows: number,
  expectedRows: number
): string {
  if (actualRows === expectedRows) {
    return `all ${count(expectedRows)} ${spec.label} present but some hold the wrong value`;
  }
  const delta = actualRows - expectedRows;
  return delta < 0
    ? `${count(-delta)} of ${count(expectedRows)} ${spec.label} missing`
    : `${count(delta)} unexpected ${noun(delta, spec)} (${count(actualRows)} vs ${count(expectedRows)} expected)`;
}

/** Total size of every non-system relation in the database. */
async function totalSize(sql: SqlRunner): Promise<number | null> {
  try {
    const out = await sql(
      `SELECT coalesce(sum(pg_total_relation_size(c.oid)), 0)::text
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'm')
         AND n.nspname NOT IN (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(", ")})
         AND n.nspname NOT LIKE 'pg_%'`
    );
    return parseInt(out.trim(), 10);
  } catch {
    return null;
  }
}

export async function verify(
  sql: SqlRunner,
  specs: EntitySpec[],
  expected: Expected,
  options: VerifyOptions = {}
): Promise<Verification> {
  let tables: ResolvedTable[];
  try {
    tables = groupTables(await introspect(sql));
  } catch (err: any) {
    return {
      status: "unknown",
      detail: `could not introspect database: ${String(err.message ?? err).slice(0, 160)}`,
      entities: [],
      dbSizeBytes: null,
      dbTotalBytes: null,
    };
  }

  const entities: EntityVerification[] = [];
  const resolved = new Map<string, ResolvedEntity>();

  for (const spec of specs) {
    const base: EntityVerification = {
      key: spec.key,
      label: spec.label,
      status: "unknown",
      detail: "",
      examples: [],
      expectedRows: expected.entities[spec.key]?.rowCount,
    };

    const expectation = expected.entities[spec.key];
    if (!expectation) {
      entities.push({
        ...base,
        detail: `no ground truth for "${spec.key}" in expected.json`,
      });
      continue;
    }

    const entity = resolveEntity(spec, tables);
    if ("error" in entity) {
      entities.push({ ...base, detail: entity.error });
      continue;
    }
    resolved.set(spec.key, entity);

    let row: string;
    try {
      row = await sql(
        checksumSql(entity.qualified, entity.fieldExprs, entity.predicate)
      );
    } catch (err: any) {
      entities.push({
        ...base,
        table: entity.displayName,
        detail: `query failed: ${String(err.message ?? err).slice(0, 160)}`,
      });
      continue;
    }

    const [countStr, checksumStr] = row.trim().split("|");
    const actualRows = parseInt(countStr, 10);

    let sizeBytes: number | undefined;
    try {
      const size = await sql(
        `SELECT pg_total_relation_size('${entity.qualified.replace(/'/g, "''")}'::regclass)::text`
      );
      sizeBytes = parseInt(size.trim(), 10);
    } catch {
      // Size is a nice-to-have; a failure here must not fail verification.
    }

    const matches =
      actualRows === expectation.rowCount && checksumStr === expectation.checksum;

    entities.push({
      ...base,
      table: entity.displayName,
      actualRows,
      sizeBytes,
      status: matches ? "ok" : "mismatch",
      detail: matches
        ? `all ${count(expectation.rowCount)} ${spec.label} match`
        : describeCounts(spec, actualRows, expectation.rowCount),
    });
  }

  // Only now, and only once, rebuild the ground-truth rows to turn each
  // mismatch into a precise description.
  const mismatched = entities.filter((e) => e.status === "mismatch");
  if (mismatched.length > 0 && options.fetchExpectedRows) {
    try {
      const expectedRows = await options.fetchExpectedRows();
      for (const entity of mismatched) {
        const spec = specs.find((s) => s.key === entity.key)!;
        const target = resolved.get(entity.key);
        const rows = expectedRows[entity.key];
        if (!target || !rows) continue;
        const diff = diffRows(spec, rows, await fetchActualRows(sql, target));
        const detail = describeDiff(spec, diff, rows.length);
        if (detail) {
          entity.detail = detail;
          entity.examples = diff.examples;
        }
      }
    } catch (err: any) {
      console.log(
        `  Could not rebuild ground-truth rows for a detailed diff: ${String(
          err.message ?? err
        ).slice(0, 160)}`
      );
    }
  }

  const unknown = entities.filter((e) => e.status === "unknown");
  let status: Verification["status"];
  let detail: string;
  if (mismatched.length > 0) {
    status = "mismatch";
    detail = mismatched.map((e) => e.detail).join("; ");
  } else if (unknown.length > 0) {
    status = "unknown";
    detail = unknown.map((e) => e.detail).join("; ");
  } else {
    status = "ok";
    detail = "all entities match";
  }

  const sized = entities.filter((e) => e.sizeBytes !== undefined);
  const dbSizeBytes = sized.length
    ? sized.reduce((sum, e) => sum + (e.sizeBytes ?? 0), 0)
    : null;

  return {
    status,
    detail,
    entities,
    dbSizeBytes,
    dbTotalBytes: await totalSize(sql),
  };
}
