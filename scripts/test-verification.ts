// Tests the verification layer (cases/lib/verify.ts) against a real
// PostgreSQL server, using table shapes that mirror how each indexer actually
// stores the same data.
//
//   ENVIO_API_TOKEN=... node scripts/test-verification.ts
//
// The benchmark itself cannot check this: if table resolution or a canonical
// SQL expression breaks, every indexer would simply be reported as "unknown"
// or, worse, uniformly wrong. These cases pin the behaviour down — including
// the negative cases, where corruption must actually be detected.
//
// Requires a superuser connection (test databases are created and dropped).
// Override the default with VERIFY_TEST_DATABASE_URL.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchLogs, TRANSFER_TOPIC } from "../cases/lib/hypersync.ts";
import { verify, formatBytes } from "../cases/lib/verify.ts";
import { caseConfig } from "../cases/erc20-transfer-events/case.config.ts";
import type { Expected } from "../cases/lib/checksum.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_URL =
  process.env.VERIFY_TEST_DATABASE_URL ??
  "postgresql://postgres:testing@localhost:5433/envio-dev";

const dbUrl = (name: string) => {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
};

function runPsql(connStr: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((res, rej) => {
    const p = spawn("psql", [connStr, "-t", "-A", ...args]);
    let out = "";
    let err = "";
    p.stdout.on("data", (c: Buffer) => (out += c.toString()));
    p.stderr.on("data", (c: Buffer) => (err += c.toString()));
    p.on("exit", (code) =>
      code === 0 ? res(out.trim()) : rej(new Error(err.trim()))
    );
    if (stdin !== undefined) p.stdin.end(stdin);
  });
}

const sqlOn = (url: string) => (query: string) => runPsql(url, ["-c", query]);
/** Large statements go through stdin; as arguments they exceed the argv limit. */
const bulkOn = (url: string) => (sql: string) => runPsql(url, ["-f", "-"], sql);

const expected: Expected = JSON.parse(
  readFileSync(resolve(ROOT, "cases/erc20-transfer-events/expected.json"), "utf8")
);

const token = process.env.ENVIO_API_TOKEN;
if (!token) {
  console.error("Error: ENVIO_API_TOKEN environment variable is required.");
  process.exit(1);
}

console.log("Fetching ground-truth logs from HyperSync...");
const logs = await fetchLogs({
  token,
  address: caseConfig.contract,
  topics: [TRANSFER_TOPIC],
  fromBlock: caseConfig.startBlock,
  toBlock: caseConfig.verifyEndBlock,
});
if (logs.length !== expected.totalEvents) {
  console.error(
    `Fetched ${logs.length} logs but expected.json records ${expected.totalEvents} — ` +
      `regenerate it with scripts/generate-expected.ts`
  );
  process.exit(1);
}
console.log(`${logs.length} logs\n`);

const expectedRows = caseConfig.computeExpected(logs).entities;
const withRows = { fetchExpectedRows: async () => expectedRows };

const ROWS = logs.map((log) => ({
  id: `${log.blockNumber}-${log.logIndex}`,
  from: log.arg0,
  to: log.arg1,
  value: log.value.toString(),
  timestamp: log.timestamp,
}));

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Mixed-case hex, as indexers keeping checksummed addresses would store. */
const checksummed = (address: string) =>
  `0x${[...address.slice(2)]
    .map((c, i) => (i % 3 === 0 ? c.toUpperCase() : c))
    .join("")}`;

async function createDb(name: string, ddl: string): Promise<string> {
  const admin = sqlOn(ADMIN_URL);
  await admin(`DROP DATABASE IF EXISTS ${name}`);
  await admin(`CREATE DATABASE ${name}`);
  const url = dbUrl(name);
  await bulkOn(url)(ddl);
  return url;
}

async function insertRows(url: string, table: string, columns: string, values: string[]) {
  const bulk = bulkOn(url);
  for (let i = 0; i < values.length; i += 2000) {
    const chunk = values.slice(i, i + 2000);
    await bulk(`INSERT INTO ${table} (${columns}) VALUES ${chunk.join(",")};`);
  }
}

// Each shape reproduces the storage decisions that make a naive hardcoded
// verifier fail: table naming, address encoding, amount type, time type, and
// in SubQuery's case superseded rows living alongside current ones.
const shapes: Record<string, () => Promise<string>> = {
  "envio (PascalCase table, checksummed text addresses)": async () => {
    const url = await createDb(
      "verify_test_envio",
      `CREATE TABLE public."TransferEvent" (
         id text primary key, "from" text, "to" text,
         amount numeric, "timestamp" integer)`
    );
    await insertRows(
      url,
      `public."TransferEvent"`,
      `id, "from", "to", amount, "timestamp"`,
      ROWS.map(
        (r) =>
          `(${quote(r.id)},${quote(checksummed(r.from))},${quote(
            checksummed(r.to)
          )},${r.value},${r.timestamp})`
      )
    );
    return url;
  },

  "ponder (snake_case table, bytea addresses, reorg side table)": async () => {
    const url = await createDb(
      "verify_test_ponder",
      `CREATE TABLE public.transfer_event (
         id text primary key, "from" bytea, "to" bytea,
         amount numeric(78,0), "timestamp" integer);
       CREATE TABLE public._reorg__transfer_event (id text, "from" bytea);
       CREATE SCHEMA ponder_sync;
       CREATE TABLE ponder_sync.logs (id text, block_number numeric)`
    );
    await insertRows(
      url,
      "public.transfer_event",
      `id, "from", "to", amount, "timestamp"`,
      ROWS.map(
        (r) =>
          `(${quote(r.id)},decode(${quote(r.from.slice(2))},'hex'),decode(${quote(
            r.to.slice(2)
          )},'hex'),${r.value},${r.timestamp})`
      )
    );
    return url;
  },

  "rindexer (project schema, uint256 as varchar, timestamptz)": async () => {
    const url = await createDb(
      "verify_test_rindexer",
      `CREATE SCHEMA erc20indexer_usdc;
       CREATE TABLE erc20indexer_usdc.transfer (
         rindexer_id serial primary key, "from" char(42), "to" char(42),
         value varchar(78), block_number numeric, block_timestamp timestamptz)`
    );
    await insertRows(
      url,
      "erc20indexer_usdc.transfer",
      `"from", "to", value, block_number, block_timestamp`,
      ROWS.map(
        (r) =>
          `(${quote(r.from)},${quote(r.to)},${quote(r.value)},0,to_timestamp(${r.timestamp}))`
      )
    );
    return url;
  },

  "subquery (historical versions filtered by _block_range)": async () => {
    const url = await createDb(
      "verify_test_subquery",
      `CREATE SCHEMA app;
       CREATE TABLE app.transfer_events (
         _id uuid default gen_random_uuid(), id text, "from" text, "to" text,
         amount numeric, "timestamp" integer, _block_range int8range)`
    );
    const columns = `id, "from", "to", amount, "timestamp", _block_range`;
    await insertRows(
      url,
      "app.transfer_events",
      columns,
      ROWS.map(
        (r) =>
          `(${quote(r.id)},${quote(r.from)},${quote(r.to)},${r.value},${r.timestamp},int8range(1,NULL))`
      )
    );
    // Superseded versions of the first 500 entities, with wrong values: these
    // must be excluded from both the row count and the checksum.
    await insertRows(
      url,
      "app.transfer_events",
      columns,
      ROWS.slice(0, 500).map(
        (r) =>
          `(${quote(r.id)},${quote(r.from)},${quote(r.to)},999,${r.timestamp},int8range(1,2))`
      )
    );
    return url;
  },
};

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
}

for (const [label, build] of Object.entries(shapes)) {
  const url = await build();
  const result = await verify(sqlOn(url), caseConfig.entities, expected);
  check(label, result.status === "ok", `${result.status}: ${result.detail}`);
  console.log(
    `        table=${result.entities[0]?.table} rows=${result.entities[0]?.actualRows} ` +
      `size=${formatBytes(result.dbSizeBytes)} total=${formatBytes(result.dbTotalBytes)}`
  );
}

console.log("\nNegative cases:");
const url = dbUrl("verify_test_envio");
const sql = sqlOn(url);
const table = `public."TransferEvent"`;

await sql(`DELETE FROM ${table} WHERE id = ${quote(ROWS[0].id)}`);
let result = await verify(sql, caseConfig.entities, expected, withRows);
check(
  "missing row is detected and described",
  result.status === "mismatch" && /1 of [\d,]+ transfer events missing/.test(result.detail),
  result.detail
);

await sql(
  `INSERT INTO ${table} VALUES (${quote(ROWS[0].id)},${quote(ROWS[0].from)},${quote(
    ROWS[0].to
  )},${ROWS[0].value},${ROWS[0].timestamp})`
);
result = await verify(sql, caseConfig.entities, expected, withRows);
check("restored row passes again", result.status === "ok", result.detail);

await sql(`INSERT INTO ${table} VALUES ('duplicate',${quote(ROWS[0].from)},${quote(
  ROWS[0].to
)},${ROWS[0].value},${ROWS[0].timestamp})`);
result = await verify(sql, caseConfig.entities, expected, withRows);
check(
  "duplicated row is detected and described",
  result.status === "mismatch" && /1 unexpected transfer event/.test(result.detail),
  result.detail
);
await sql(`DELETE FROM ${table} WHERE id = 'duplicate'`);

// Row count still matches — only the checksum can catch these two.
await sql(`UPDATE ${table} SET amount = amount + 1 WHERE id = ${quote(ROWS[1].id)}`);
result = await verify(sql, caseConfig.entities, expected, withRows);
check(
  "wrong value is detected and described",
  result.status === "mismatch" && !/checksum/i.test(result.detail),
  result.detail
);
check(
  "wrong value reports a concrete example",
  (result.entities.find((e) => e.status === "mismatch")?.examples.length ?? 0) > 0,
  JSON.stringify(result.entities.find((e) => e.status === "mismatch")?.examples ?? [])
);
await sql(`UPDATE ${table} SET amount = amount - 1 WHERE id = ${quote(ROWS[1].id)}`);

await sql(`UPDATE ${table} SET "from" = "to", "to" = "from" WHERE id = ${quote(ROWS[2].id)}`);
result = await verify(sql, caseConfig.entities, expected, withRows);
check("swapped fields are detected", result.status === "mismatch", result.detail);

const emptyUrl = await createDb("verify_test_empty", "SELECT 1");
result = await verify(sqlOn(emptyUrl), caseConfig.entities, expected, withRows);
check(
  "missing table reports unknown, not a failure",
  result.status === "unknown",
  result.detail
);

for (const name of [
  "verify_test_envio",
  "verify_test_ponder",
  "verify_test_rindexer",
  "verify_test_subquery",
  "verify_test_empty",
]) {
  await sqlOn(ADMIN_URL)(`DROP DATABASE IF EXISTS ${name}`).catch(() => {});
}

console.log(
  failures === 0 ? "\nAll verification checks passed" : `\n${failures} check(s) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
