// What every driver has to provide, and the settings they share.

import type { CaseConfig } from "../case.ts";
import { whereClause } from "../checksum.ts";
import { psql } from "../process.ts";
import { resolveEntityTables, type EntityTable } from "../verify.ts";

/**
 * Port the indexers that insist on serving an HTTP API are pointed at. Progress
 * is read from PostgreSQL, so nothing here queries it; it exists so an indexer
 * whose API cannot be turned off binds somewhere predictable instead of
 * fighting another service for a default port.
 */
export const BENCHMARK_PORT = 19_876;

export interface Snapshot {
  /** Blocks indexed past the case's start block. */
  blocks: number;
  events: number;
}

export interface Driver {
  name: string;
  dbUrl: string;
  /** Install, build and start infrastructure. Not part of the measurement. */
  prepare(): Promise<void>;
  /** Start indexing. The measured window opens when this returns. */
  launch(): Promise<void>;
  snapshot(): Promise<Snapshot | null>;
  /** Stop indexer processes, leaving the database readable. */
  stop(): Promise<void>;
  /** Tear down containers and volumes. */
  cleanup(): Promise<void>;
  /** True once the indexer exited on its own, e.g. on reaching its end block. */
  exited(): boolean;
}

export interface Ctx {
  config: CaseConfig;
  rpcUrl: string;
  endBlock: number;
}

export type DriverFactory = (ctx: Ctx) => Driver;

/** Rows counted, and the highest block they were seen at. */
export interface Progress {
  events: number;
  block: number;
}

/**
 * Counts indexed events directly in the indexer's own tables.
 *
 * Every indexer names the same entities differently, so the tables are found by
 * introspection — the same resolution the verification layer uses — rather than
 * being spelled out per indexer in the case config. Resolution is cached after
 * the first success and dropped again whenever a query fails, so a driver that
 * recreates its schema between phases re-resolves instead of going on querying
 * a table that no longer exists.
 *
 * `blockExpr` is a SQL expression yielding the block number of a row; the
 * highest across the event tables is how far the indexer has got. Drivers whose
 * indexer records its own progress pass nothing and read that instead, which is
 * the more accurate reading: it advances through ranges that produced no events.
 */
export function createProgressReader(
  dbUrl: string,
  config: CaseConfig,
  blockExpr?: string
): () => Promise<Progress> {
  const sql = (query: string) => psql(dbUrl, query);
  const specs = config.eventEntities.map((key) => {
    const spec = config.entities.find((entity) => entity.key === key);
    if (!spec) {
      throw new Error(
        `case "${config.name}" lists "${key}" in eventEntities but has no such entity`
      );
    }
    return spec;
  });
  let tables: EntityTable[] | null = null;

  return async () => {
    try {
      tables ??= await resolveEntityTables(sql, specs);
      const counts = tables
        .map((t) => `(SELECT count(*) FROM ${t.qualified}${whereClause(t.predicate)})`)
        .join(" + ");
      // coalesce per table rather than once around the whole expression: an
      // indexer that has written to one event table and not yet to the other
      // would otherwise read as no progress at all.
      const block = blockExpr
        ? `greatest(${tables
            .map(
              (t) =>
                `coalesce((SELECT max(${blockExpr}) FROM ${t.qualified}` +
                `${whereClause(t.predicate)}), 0)`
            )
            .join(", ")})`
        : "0";
      const row = await sql(`SELECT (${counts})::text, (${block})::bigint::text`);
      const [events, highest] = row.split("|");
      return { events: parseInt(events, 10) || 0, block: parseInt(highest, 10) || 0 };
    } catch (err) {
      // The tables may not exist yet, or may have just been dropped and
      // recreated elsewhere. Either way the cached resolution is no longer
      // trustworthy, so the next call resolves again.
      tables = null;
      throw err;
    }
  };
}

/** Blocks past the case's start block, floored at zero. */
export function blocksIndexed(config: CaseConfig, block: number): number {
  return block > config.startBlock ? block - config.startBlock : 0;
}
