// Reading a tool's data back out without knowing how it named anything.
//
// The throughput benchmark reduces each table to a checksum, because the tables
// there are large and the only question is "is this exactly right". Reliability
// asks narrower questions of much smaller tables — which rows survived a reorg,
// which one row holds a NUL byte — so the rows are read in full and compared
// directly. That is what makes a result say "block 812 is indexed twice"
// instead of "the checksum differs".
//
// Table and column names are still resolved by introspection rather than
// hardcoded per tool, for the same reason the benchmark does it: an indexer
// that renames a column between releases should show up as a schema change to
// look at, not as a data loss to publish.

import { psql } from "../../cases/lib/process.ts";

export type FieldKind = "address" | "hash" | "amount" | "number" | "seconds" | "text";

export interface FieldSpec {
  role: string;
  kind: FieldKind;
  /** Column names to try, most specific first; compared case-insensitively. */
  candidates: string[];
  /**
   * Leave the field out of the comparison when no column matches, instead of
   * failing to resolve the entity. For fields that not every tool exposes and
   * whose absence weakens the check without invalidating it.
   */
  optional?: boolean;
}

export interface EntitySpec {
  key: string;
  label: string;
  /** Table names to try, most specific first; `_`, case and a trailing `s` are ignored. */
  tableCandidates: string[];
  fields: FieldSpec[];
}

export interface ResolvedEntity {
  key: string;
  qualified: string;
  displayName: string;
  /** Roles actually present, in the order the canonical row encodes them. */
  roles: string[];
  fieldExprs: string[];
  /** Bare predicate limiting the rows to current entity versions, or "". */
  predicate: string;
}

/**
 * Field and record separators. The hostile-data scenario deliberately stores a
 * value containing a newline and a tab, so neither can separate anything here.
 */
export const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

const SYSTEM_SCHEMAS = ["pg_catalog", "information_schema"];

interface Column {
  schema: string;
  table: string;
  column: string;
  dataType: string;
}

interface Table {
  schema: string;
  table: string;
  columns: Map<string, Column>;
}

const normalise = (name: string) =>
  name.toLowerCase().replace(/_/g, "").replace(/s$/, "");

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function introspect(url: string, schemaFilter?: string[]): Promise<Table[]> {
  const filter = schemaFilter?.length
    ? ` AND c.table_schema IN (${schemaFilter.map((s) => `'${s}'`).join(", ")})`
    : "";
  const raw = await psql(
    url,
    `SELECT coalesce(string_agg(
       c.table_schema || E'\\x1f' || c.table_name || E'\\x1f' || c.column_name ||
       E'\\x1f' || c.data_type, E'\\x1e'), '')
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE t.table_type = 'BASE TABLE'
       AND c.table_schema NOT IN (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(", ")})
       AND c.table_schema NOT LIKE 'pg\\_%'${filter}`
  );

  const tables = new Map<string, Table>();
  for (const record of raw.split(RECORD_SEP)) {
    if (!record.trim()) continue;
    const [schema, table, column, dataType] = record.split(FIELD_SEP);
    const key = `${schema}.${table}`;
    let entry = tables.get(key);
    if (!entry) {
      entry = { schema, table, columns: new Map() };
      tables.set(key, entry);
    }
    entry.columns.set(column.toLowerCase(), { schema, table, column, dataType });
  }
  return [...tables.values()];
}

/** Canonical SQL for a column, normalising the storage each tool happens to pick. */
function fieldExpr(field: FieldSpec, column: Column): string {
  const ident = quote(column.column);
  const type = column.dataType.toLowerCase();
  switch (field.kind) {
    case "address":
    case "hash":
      // Ponder stores hex as bytea; everyone else as text.
      return type === "bytea"
        ? `('0x' || encode(${ident}, 'hex'))`
        : `lower(${ident}::text)`;
    case "amount":
      return `(${ident}::numeric)::text`;
    case "number":
      return `(${ident}::numeric)::bigint::text`;
    case "seconds":
      return type.startsWith("timestamp") || type === "date"
        ? `(extract(epoch from ${ident})::bigint)::text`
        : `(${ident}::numeric)::bigint::text`;
    case "text":
      return `coalesce(${ident}::text, '')`;
  }
}

function pickTable(spec: EntitySpec, tables: Table[]): Table | string {
  const candidates = spec.tableCandidates.map(normalise);
  let best: { rank: number; matches: Table[] } | null = null;
  for (const table of tables) {
    const rank = candidates.indexOf(normalise(table.table));
    if (rank === -1) continue;
    if (!best || rank < best.rank) best = { rank, matches: [table] };
    else if (rank === best.rank) best.matches.push(table);
  }
  if (!best) return `no table matching ${spec.tableCandidates.join(" / ")}`;

  let matches = best.matches;
  if (matches.length > 1) {
    // Prefer the one exposing every required field: several tools keep a
    // similarly-named table of their own bookkeeping alongside the entity.
    const complete = matches.filter((table) =>
      spec.fields.every(
        (field) => field.optional || field.candidates.some((c) => table.columns.has(c.toLowerCase()))
      )
    );
    if (complete.length > 0) matches = complete;
  }
  if (matches.length > 1) {
    return `ambiguous table for ${spec.key}: ${matches
      .map((t) => `${t.schema}.${t.table}`)
      .join(", ")}`;
  }
  return matches[0];
}

export async function resolveEntities(
  url: string,
  specs: EntitySpec[],
  schemaFilter?: string[]
): Promise<Map<string, ResolvedEntity | string>> {
  const tables = await introspect(url, schemaFilter);
  const out = new Map<string, ResolvedEntity | string>();

  for (const spec of specs) {
    const table = pickTable(spec, tables);
    if (typeof table === "string") {
      out.set(spec.key, table);
      continue;
    }

    const roles: string[] = [];
    const fieldExprs: string[] = [];
    let error: string | null = null;
    for (const field of spec.fields) {
      const column = field.candidates
        .map((candidate) => table.columns.get(candidate.toLowerCase()))
        .find(Boolean);
      if (!column) {
        if (field.optional) continue;
        error =
          `${table.schema}.${table.table} has no column for "${field.role}" ` +
          `(tried ${field.candidates.join(" / ")})`;
        break;
      }
      roles.push(field.role);
      fieldExprs.push(fieldExpr(field, column));
    }
    if (error) {
      out.set(spec.key, error);
      continue;
    }

    out.set(spec.key, {
      key: spec.key,
      qualified: `${quote(table.schema)}.${quote(table.table)}`,
      displayName: `${table.schema}.${table.table}`,
      roles,
      fieldExprs,
      // SubQuery (`_block_range`) and Graph Node (`block_range`) keep superseded
      // entity versions in the same table; only the current version is present
      // state. Graph Node's immutable entities have no range column at all.
      predicate: table.columns.has("_block_range")
        ? "upper_inf(_block_range)"
        : table.columns.has("block_range")
          ? "upper_inf(block_range)"
          : "",
    });
  }
  return out;
}

/** Every row of an entity, canonically encoded, sorted for stable comparison. */
export async function readRows(
  url: string,
  entity: ResolvedEntity
): Promise<string[]> {
  // Every expression is coalesced, because `concat_ws` skips NULL arguments
  // without emitting a separator for them. One NULL column would shorten the
  // row by a field, and every field after it would then be compared against —
  // and reported as — the wrong column.
  const canonical = `concat_ws('${FIELD_SEP}', ${entity.fieldExprs
    .map((expr) => `coalesce(${expr}, '')`)
    .join(", ")})`;
  const where = entity.predicate ? ` WHERE ${entity.predicate}` : "";
  const raw = await psql(
    url,
    `SELECT coalesce(string_agg(row_text, E'\\x1e' ORDER BY row_text), '')
     FROM (SELECT ${canonical} AS row_text FROM ${entity.qualified}${where}) rows`
  );
  return raw.split(RECORD_SEP).filter((row) => row.length > 0);
}

/** The canonical row text for a set of already-encoded field values. */
export const canonicalRow = (fields: string[]): string => fields.join(FIELD_SEP);

/** The fields of a canonical row, in the order the entity spec declares them. */
export const rowFields = (row: string): string[] => row.split(FIELD_SEP);
