// A ClickHouse counterpart to `psql`, for the tools that keep their entities
// there rather than in PostgreSQL.

import { sleep } from "./process.ts";

export interface ClickHouseConnection {
  /** The HTTP interface, e.g. http://localhost:8123. */
  url: string;
  username: string;
  password: string;
  database: string;
}

/**
 * Run a query over ClickHouse's HTTP interface and return its output the way
 * `psql -t -A` would: one line per row, columns joined by "|", trimmed.
 *
 * That shape is what lets verification and progress reading treat the two
 * databases alike, since everything downstream of a query parses psql's
 * output. TSVRaw rather than TSV, so a value is returned as it is stored and
 * not with ClickHouse's escaping applied to it.
 */
export async function clickhouse(
  conn: ClickHouseConnection,
  query: string,
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {}
): Promise<string> {
  const url = new URL(conn.url);
  url.searchParams.set("database", conn.database);
  url.searchParams.set("default_format", "TSVRaw");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${conn.username}:${conn.password}`).toString("base64")}`,
    },
    body: query,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`clickhouse failed (${res.status}): ${body.trim()}`);
  }
  return body
    .trim()
    .split("\n")
    .map((line) => line.replaceAll("\t", "|"))
    .join("\n");
}

/** Poll ClickHouse until it answers a query. */
export async function waitClickHouse(conn: ClickHouseConnection, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await clickhouse(conn, "SELECT 1", { timeoutMs: 2_000 });
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(`ClickHouse at ${conn.url} did not become ready within ${timeoutMs / 1000}s`);
}
