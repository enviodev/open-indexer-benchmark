// Verifies an indexer's database against the committed ground truth, and
// measures the on-disk size of the data it produced.
//
// Every indexer models the same case with a different schema (table naming,
// column naming, storage types), so tables and columns are resolved by
// introspection against per-entity candidate lists rather than hardcoded per
// indexer. When resolution is ambiguous or a column is missing, the result is
// reported as "unknown" with the reason — never as a correctness failure, so a
// schema change in an indexer cannot be mistaken for a data bug.

import {
  checksumSql,
  type EntitySpec,
  type Expected,
  type FieldSpec,
} from "./checksum.ts";

/** Runs a SQL statement and returns psql's `-t -A` output. */
export type SqlRunner = (query: string) => Promise<string>;

export interface EntityVerification {
  key: string;
  label: string;
  status: "ok" | "mismatch" | "unknown";
  detail: string;
  table?: string;
  expectedRows?: number;
  actualRows?: number;
  sizeBytes?: number;
}

export interface Verification {
  status: "ok" | "mismatch" | "unknown";
  /** Short human-readable summary, e.g. "12 transfer events missing". */
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

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema"];

/** `transfer_event`, `TransferEvent` and `transferEvents` all normalise alike. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/_/g, "").replace(/s$/, "");
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function introspect(sql: SqlRunner): Promise<ColumnInfo[]> {
  const rows = await sql(
    `SELECT c.table_schema, c.table_name, c.column_name, c.data_type, t.table_type
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema NOT IN (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(", ")})
       AND c.table_schema NOT LIKE 'pg_%'`
  );
  const out: ColumnInfo[] = [];
  for (const line of rows.split("\n")) {
    if (!line.trim()) continue;
    const [schema, table, column, dataType, tableType] = line.split("|");
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

interface ResolvedTable {
  schema: string;
  table: string;
  isBaseTable: boolean;
  columns: Map<string, ColumnInfo>;
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

function findColumn(
  table: ResolvedTable,
  field: FieldSpec
): ColumnInfo | undefined {
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
function resolveTable(
  spec: EntitySpec,
  tables: ResolvedTable[]
): { table: ResolvedTable } | { error: string } {
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
    const complete = matches.filter((t) =>
      spec.fields.every((f) => findColumn(t, f))
    );
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
  return { table: matches[0] };
}

async function verifyEntity(
  sql: SqlRunner,
  spec: EntitySpec,
  expectation: { rowCount: number; checksum: string },
  tables: ResolvedTable[]
): Promise<EntityVerification> {
  const base: EntityVerification = {
    key: spec.key,
    label: spec.label,
    status: "unknown",
    detail: "",
    expectedRows: expectation.rowCount,
  };

  const resolved = resolveTable(spec, tables);
  if ("error" in resolved) {
    return { ...base, detail: resolved.error };
  }
  const { table } = resolved;
  const qualified = `${quoteIdent(table.schema)}.${quoteIdent(table.table)}`;
  const displayName = `${table.schema}.${table.table}`;

  const exprs: string[] = [];
  for (const field of spec.fields) {
    const col = findColumn(table, field);
    if (!col) {
      return {
        ...base,
        table: displayName,
        detail: `${displayName} has no column for "${field.role}" (tried ${field.candidates.join(
          " / "
        )})`,
      };
    }
    exprs.push(fieldExpr(field, col));
  }

  // SubQuery keeps historical entity versions in the same table; restrict to
  // the current version so counts and checksums describe present state. The
  // discarded history still shows up in the measured table size, which is the
  // honest way to report the cost of keeping it.
  const where = table.columns.has("_block_range")
    ? " WHERE upper_inf(_block_range)"
    : "";

  let row: string;
  try {
    row = await sql(checksumSql(qualified, exprs) + where);
  } catch (err: any) {
    return {
      ...base,
      table: displayName,
      detail: `query failed: ${String(err.message ?? err).slice(0, 160)}`,
    };
  }

  const [countStr, checksumStr] = row.trim().split("|");
  const actualRows = parseInt(countStr, 10);

  let sizeBytes: number | undefined;
  try {
    const size = await sql(
      `SELECT pg_total_relation_size('${qualified.replace(/'/g, "''")}'::regclass)::text`
    );
    sizeBytes = parseInt(size.trim(), 10);
  } catch {
    // Size is a nice-to-have; a failure here must not fail verification.
  }

  const result = { ...base, table: displayName, actualRows, sizeBytes };

  if (actualRows !== expectation.rowCount) {
    const delta = actualRows - expectation.rowCount;
    return {
      ...result,
      status: "mismatch",
      detail: `${Math.abs(delta).toLocaleString("en-US")} ${
        delta < 0 ? "missing" : "extra"
      } ${spec.label} (${actualRows.toLocaleString(
        "en-US"
      )} vs ${expectation.rowCount.toLocaleString("en-US")} expected)`,
    };
  }
  if (checksumStr !== expectation.checksum) {
    return {
      ...result,
      status: "mismatch",
      detail: `${spec.label}: row count matches but values differ (checksum mismatch)`,
    };
  }
  return { ...result, status: "ok", detail: `${spec.label} match` };
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
  expected: Expected
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
  for (const spec of specs) {
    const expectation = expected.entities[spec.key];
    if (!expectation) {
      entities.push({
        key: spec.key,
        label: spec.label,
        status: "unknown",
        detail: `no ground truth for "${spec.key}" in expected.json`,
      });
      continue;
    }
    entities.push(await verifyEntity(sql, spec, expectation, tables));
  }

  const mismatched = entities.filter((e) => e.status === "mismatch");
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

/** Human-readable byte size for the result tables. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
