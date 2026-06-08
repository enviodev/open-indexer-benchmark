// @ts-nocheck
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, existsSync, writeFileSync } from "node:fs";

// ── Config ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONDER_DIR = resolve(__dirname, "ponder");
const ENVIO_DIR = resolve(__dirname, "envio");
const RINDEXER_DIR = resolve(__dirname, "rindexer");
const SUBQUERY_DIR = resolve(__dirname, "subquery");
const SQUID_DIR = resolve(__dirname, "sqd");
const START_BLOCK = 18_600_000;
const BENCHMARK_PORT = 19_876;

const DURATION_S = (() => {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  return flag ? parseInt(flag.split("=")[1], 10) : 60;
})();

// Per-indexer run durations. Most indexers run for DURATION_S, but SubQuery
// starts up slowly inside Docker, so we extend its run to amortise the boot
// cost. The summary uses each indexer's actual DURATION_S to compute per-second
// rates, and surfaces a "(Ns)" tag whenever it differs from DURATION_S.
const SUBQUERY_DURATION_S = Math.max(DURATION_S, 180);
// Envio with HyperSync catches up to the chain head quickly, so a shorter
// window keeps the measurement representative of steady-state throughput.
const ENVIO_HYPERSYNC_DURATION_S = Math.min(DURATION_S, 45);

const SUMMARY_DELAY_MS = 3_000;

// ── Types ──────────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  // The actual run window for this indexer. Most use DURATION_S; SubQuery
  // extends to SUBQUERY_DURATION_S. Surfaced in the summary so any non-
  // baseline runs are visible.
  durationS: number;
  blocksPerSec: number;
  eventsPerSec: number;
}

function buildResult(
  name: string,
  totalBlocks: number,
  totalEvents: number,
  durationS: number
): BenchmarkResult {
  return {
    name,
    durationS,
    blocksPerSec: durationS > 0 ? totalBlocks / durationS : 0,
    eventsPerSec: durationS > 0 ? totalEvents / durationS : 0,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run a command to completion, inheriting stdio. */
function exec(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env });
    p.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`)
          )
    );
  });
}

/** Spawn a long-running process, forwarding output with a tag. */
function start(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): ChildProcess {
  const p = spawn(cmd, args, { cwd, stdio: "pipe", detached: true, env });
  for (const stream of [p.stdout, p.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line) console.log(`  ${line}`);
      }
    });
  }
  return p;
}

/** Kill a process and its entire process group. */
function kill(proc: ChildProcess): Promise<void> {
  if (!proc.pid) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-proc.pid!, "SIGKILL");
      } catch {}
      resolve();
    }, 5_000);
    proc.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  });
}

/** Send a GraphQL query and return the `data` field. */
async function gql<T = any>(url: string, query: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.errors)
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

/** Poll a GraphQL endpoint until it responds. */
async function waitReady(url: string, query: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await gql(url, query);
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(
    `GraphQL endpoint ${url} did not become ready within ${timeoutMs / 1000}s`
  );
}

/** Run a SQL query via psql and return the trimmed stdout. */
function psql(connStr: string, query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("psql", [connStr, "-t", "-A", "-c", query], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    p.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    p.on("exit", (code) =>
      code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`psql failed (${code}): ${stderr}`))
    );
  });
}

/** Poll a PostgreSQL database until the given query succeeds. */
async function waitPg(connStr: string, query: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await psql(connStr, query);
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(
    `PostgreSQL ${connStr} did not become ready within ${timeoutMs / 1000}s`
  );
}

// ── Cleanup on unexpected exit ─────────────────────────────────────────

let activeProc: ChildProcess | null = null;
let activeDockerDir: string | null = null;

async function cleanup() {
  if (activeProc) {
    await kill(activeProc);
    activeProc = null;
  }
  if (activeDockerDir) {
    try {
      await exec("docker", ["compose", "down", "-v"], activeDockerDir);
    } catch {}
    activeDockerDir = null;
  }
  // Clean up standalone containers
  try {
    await exec("docker", ["rm", "-f", PONDER_PG_CONTAINER], __dirname);
  } catch {}
}
process.on("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(143);
});

// ── Ponder Benchmark ───────────────────────────────────────────────────

const PONDER_PG_PORT = 19_877;
const PONDER_PG_CONTAINER = "ponder-benchmark-pg";
const PONDER_DB_URL = `postgresql://postgres:postgres@localhost:${PONDER_PG_PORT}/ponder`;

async function benchmarkPonder(rpcUrl: string): Promise<BenchmarkResult> {
  console.log("\n--- Ponder ---\n");

  // Clean previous state
  console.log("Cleaning .ponder cache...");
  rmSync(resolve(PONDER_DIR, ".ponder"), { recursive: true, force: true });

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], PONDER_DIR);

  // Start PostgreSQL for Ponder
  console.log("Starting PostgreSQL for Ponder...");
  try {
    await exec("docker", ["rm", "-f", PONDER_PG_CONTAINER], PONDER_DIR);
  } catch {}
  await exec("docker", [
    "run", "-d", "--name", PONDER_PG_CONTAINER,
    "-e", "POSTGRES_PASSWORD=postgres",
    "-e", "POSTGRES_DB=ponder",
    "-p", `${PONDER_PG_PORT}:5432`,
    "postgres:17-alpine",
  ], PONDER_DIR);
  await waitPg(PONDER_DB_URL, "SELECT 1");

  const delayPromise = sleep(DURATION_S * 1_000);

  // Start ponder dev with PostgreSQL
  console.log(`\nStarting ponder dev for ${DURATION_S}s...\n`);
  const ponderEnv = {
    ...process.env,
    PONDER_RPC_URL_1: rpcUrl,
    DATABASE_URL: PONDER_DB_URL,
  };
  const dev = start(
    "pnpm",
    ["ponder", "dev", "--disable-ui", `--port=${BENCHMARK_PORT}`],
    PONDER_DIR,
    ponderEnv
  );
  activeProc = dev;

  // Wait for tables to exist, sleep concurrently
  await Promise.all([
    waitPg(PONDER_DB_URL, "SELECT 1 FROM transfer_event LIMIT 1"),
    delayPromise,
  ]);

  // Snapshot results from PostgreSQL
  const [transferCount, checkpoint] = await Promise.all([
    psql(PONDER_DB_URL, "SELECT count(*) FROM transfer_event"),
    psql(PONDER_DB_URL, 'SELECT "latest_checkpoint" FROM _ponder_checkpoint LIMIT 1').catch(() => ""),
  ]);
  await kill(dev);
  activeProc = null;

  // Stop PostgreSQL
  try {
    await exec("docker", ["rm", "-f", PONDER_PG_CONTAINER], PONDER_DIR);
  } catch {}

  // Compute metrics
  const totalEvents = parseInt(transferCount, 10) || 0;
  // Checkpoint is a 75-char string: [10 timestamp][16 chainId][16 blockNumber]...
  const block = checkpoint.length >= 42 ? Number(BigInt(checkpoint.slice(26, 42))) : 0;
  const totalBlocks = block > START_BLOCK ? block - START_BLOCK : 0;

  return buildResult("Ponder", totalBlocks, totalEvents, DURATION_S);
}

// ── Envio Benchmark ────────────────────────────────────────────────────

// Envio defaults: user=postgres, password=testing, database=envio-dev, port=5433
const ENVIO_PG_PORT = 5433;
const ENVIO_DB_URL = `postgresql://postgres:testing@localhost:${ENVIO_PG_PORT}/envio-dev`;

async function benchmarkEnvioImpl(
  rpcUrl: string,
  mode: "hypersync" | "rpc"
): Promise<BenchmarkResult> {
  const label = mode === "rpc" ? "Envio - RPC" : "Envio";
  const durationS = mode === "rpc" ? DURATION_S : ENVIO_HYPERSYNC_DURATION_S;
  console.log(`\n--- ${label} ---\n`);

  // Clean previous state
  console.log("Cleaning envio cache...");
  rmSync(resolve(ENVIO_DIR, ".envio"), { recursive: true, force: true });

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], ENVIO_DIR);

  const durationPromise = sleep(durationS * 1_000);

  // Start envio with TUI and Hasura disabled — we read PostgreSQL directly
  const envioEnv = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_HASURA: "false",
    ENVIO_PG_PORT: String(ENVIO_PG_PORT),
    ENVIO_RPC_URL: rpcUrl,
    ENVIO_RPC_FOR: mode === "rpc" ? "sync" : "fallback",
  };
  console.log(`\nStarting envio for ${durationS}s...\n`);
  await exec("pnpm", ["envio", "codegen"], ENVIO_DIR, envioEnv);
  const dev = start("pnpm", ["envio", "start", "-r"], ENVIO_DIR, envioEnv);
  activeProc = dev;

  // Wait for envio_chains table to have data, sleep concurrently
  await Promise.all([
    waitPg(ENVIO_DB_URL, "SELECT 1 FROM public.envio_chains LIMIT 1"),
    durationPromise,
  ]);

  // Snapshot results from PostgreSQL
  const metaRow = await psql(
    ENVIO_DB_URL,
    "SELECT events_processed, progress_block FROM public.envio_chains LIMIT 1"
  );
  await kill(dev);
  activeProc = null;

  // Parse "events_processed|progress_block" (psql -A uses | as delimiter)
  const [eventsStr, blockStr] = metaRow.split("|");
  const totalEvents = parseInt(eventsStr, 10) || 0;
  const progressBlock = parseInt(blockStr, 10) || 0;
  const totalBlocks = progressBlock > START_BLOCK ? progressBlock - START_BLOCK : 0;

  return buildResult(label, totalBlocks, totalEvents, durationS);
}

async function benchmarkEnvio(rpcUrl: string): Promise<BenchmarkResult> {
  return benchmarkEnvioImpl(rpcUrl, "hypersync");
}

async function benchmarkEnvioRpc(rpcUrl: string): Promise<BenchmarkResult> {
  return benchmarkEnvioImpl(rpcUrl, "rpc");
}

// ── Rindexer Benchmark ────────────────────────────────────────────────

async function benchmarkRindexer(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = `http://localhost:${BENCHMARK_PORT}/graphql`;
  const rindexerEnv = {
    ...process.env,
    ETHEREUM_RPC: rpcUrl,
    DATABASE_URL: "postgresql://postgres:rindexer@localhost:5440/postgres",
    POSTGRES_PASSWORD: "rindexer",
    // TEMP DIAGNOSTIC: rindexer reports 0 blocks/0 events on USDC with no error
    // at the default INFO level — it logs "Historical indexing started" then goes
    // silent. Crank up logging to capture the actual eth_getLogs ranges, response
    // sizes, and any retry/throttle behaviour so we can see why it never commits.
    // Remove once the root cause is understood.
    RUST_LOG: "debug",
  };
  // PostGraphile exposes allTransfers from the auto-generated schema
  // (raw event table `transfer` in schema erc20indexer_usdc).
  // We query totalCount for event counts and the last transfer for block progress.
  const READY_QUERY = `{
    allTransfers(first: 1) {
      totalCount
    }
  }`;

  console.log("\n--- Rindexer ---\n");

  // Install rindexer CLI if not already present
  const rindexerBin = resolve(
    process.env.HOME ?? "~",
    ".config",
    ".rindexer",
    "bin",
    "rindexer"
  );
  if (!existsSync(rindexerBin)) {
    console.log("Installing rindexer CLI...\n");
    await exec(
      "bash",
      ["-c", "curl -L https://rindexer.xyz/install.sh | bash"],
      RINDEXER_DIR,
      rindexerEnv
    );
  }

  // Start PostgreSQL via docker compose (down -v first so we get a clean DB and avoid schema-change prompts)
  console.log("Starting PostgreSQL via docker compose...");
  await exec(
    "docker",
    ["compose", "down", "-v"],
    RINDEXER_DIR,
    rindexerEnv
  ).catch(() => {});
  await exec("docker", ["compose", "up", "-d"], RINDEXER_DIR, rindexerEnv);
  await sleep(3_000); // Wait for PostgreSQL to be ready

  const durationPromise = sleep(DURATION_S * 1_000);

  // Start rindexer (indexer + graphql)
  console.log(`\nStarting rindexer for ${DURATION_S}s...\n`);
  const dev = start(rindexerBin, ["start", "all"], RINDEXER_DIR, rindexerEnv);
  activeProc = dev;

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([
    waitReady(GRAPHQL_URL, READY_QUERY, DURATION_S * 1_000),
    durationPromise,
  ]);

  // Snapshot results — event counts and max block in one query
  let totalEvents = 0;
  let totalBlocks = 0;
  try {
    const resultsQuery = `{
      allTransfers {
        totalCount
      }
      lastTransfer: allTransfers(last: 1, orderBy: BLOCK_NUMBER_ASC) {
        nodes {
          blockNumber
        }
      }
    }`;
    const data: any = await gql(GRAPHQL_URL, resultsQuery);
    totalEvents = data.allTransfers?.totalCount ?? 0;
    const maxBlock = Number(data.lastTransfer?.nodes?.[0]?.blockNumber ?? 0);
    if (maxBlock > START_BLOCK) {
      totalBlocks = maxBlock - START_BLOCK;
    }
  } catch {
    console.log("  Warning: Could not query results from GraphQL");
  }

  await kill(dev);
  activeProc = null;

  // Stop PostgreSQL
  await exec("docker", ["compose", "down"], RINDEXER_DIR, rindexerEnv);

  return buildResult("Rindexer", totalBlocks, totalEvents, DURATION_S);
}

// ── SubQuery Benchmark ────────────────────────────────────────────────

async function benchmarkSubQuery(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = `http://localhost:${BENCHMARK_PORT}`;
  const QUERY = `{
    _metadata {
      lastProcessedHeight
    }
    transferEvents {
      totalCount
    }
  }`;

  console.log("\n--- SubQuery ---\n");

  // Clean previous state
  console.log("Cleaning subquery cache...");
  rmSync(resolve(SUBQUERY_DIR, ".data"), { recursive: true, force: true });
  rmSync(resolve(SUBQUERY_DIR, "dist"), { recursive: true, force: true });
  rmSync(resolve(SUBQUERY_DIR, "src/types"), { recursive: true, force: true });

  const subqueryEnv = { ...process.env, ETHEREUM_RPC_URL: rpcUrl };

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], SUBQUERY_DIR);

  // Codegen and build (needs ETHEREUM_RPC_URL so project.ts resolves the endpoint)
  console.log("Running codegen and build...\n");
  await exec("pnpm", ["codegen"], SUBQUERY_DIR, subqueryEnv);
  await exec("pnpm", ["build"], SUBQUERY_DIR, subqueryEnv);

  // Write .env file for docker-compose
  writeFileSync(
    resolve(SUBQUERY_DIR, ".env"),
    `ETHEREUM_RPC_URL=${rpcUrl}\n`
  );

  // Pre-initialize Docker infrastructure (not counted toward benchmark time)
  console.log("Cleaning previous docker state...");
  await exec(
    "docker",
    ["compose", "down", "-v"],
    SUBQUERY_DIR,
    subqueryEnv
  ).catch(() => {});

  console.log("Pulling images and starting postgres...");
  await exec("docker", ["compose", "pull"], SUBQUERY_DIR, subqueryEnv);
  await exec(
    "docker",
    ["compose", "up", "-d", "postgres"],
    SUBQUERY_DIR,
    subqueryEnv
  );
  activeDockerDir = SUBQUERY_DIR;

  // Wait for postgres to be healthy before starting the benchmark timer
  console.log("Waiting for postgres to be ready...");
  const pgDeadline = Date.now() + 30_000;
  while (Date.now() < pgDeadline) {
    try {
      await exec(
        "docker",
        ["compose", "exec", "postgres", "pg_isready", "-U", "postgres"],
        SUBQUERY_DIR,
        subqueryEnv
      );
      break;
    } catch {
      await sleep(1_000);
    }
  }

  // Start benchmark timer — app startup is included, Docker/DB init is not.
  const durationPromise = sleep(SUBQUERY_DURATION_S * 1_000);

  console.log(`\nStarting SubQuery services for ${SUBQUERY_DURATION_S}s...\n`);
  const dev = start(
    "docker",
    ["compose", "up", "--remove-orphans"],
    SUBQUERY_DIR,
    subqueryEnv
  );
  activeProc = dev;

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([
    waitReady(GRAPHQL_URL, QUERY, SUBQUERY_DURATION_S * 1_000),
    durationPromise,
  ]);

  // Snapshot results
  const data: any = await gql(GRAPHQL_URL, QUERY);

  // Tear down docker-compose
  await kill(dev);
  activeProc = null;
  await exec("docker", ["compose", "down", "-v"], SUBQUERY_DIR, subqueryEnv);
  activeDockerDir = null;

  const totalEvents: number = data.transferEvents?.totalCount ?? 0;

  const lastHeight: number = data._metadata?.lastProcessedHeight ?? 0;
  const totalBlocks = lastHeight > START_BLOCK ? lastHeight - START_BLOCK : 0;

  return buildResult("SubQuery", totalBlocks, totalEvents, SUBQUERY_DURATION_S);
}

// ── Sqd Benchmark ───────────────────────────────────────────────────

async function benchmarkSqd(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = `http://localhost:${BENCHMARK_PORT}/graphql`;
  const QUERY = `{
    transferEventsConnection(orderBy: id_ASC) {
      totalCount
    }
  }`;

  // Query to detect the highest indexed block via the last transfer event
  const BLOCK_QUERY = `{
    transferEvents(orderBy: id_DESC, limit: 1) {
      id
    }
  }`;

  console.log("\n--- Sqd ---\n");

  // Clean previous state
  console.log("Cleaning squid build artifacts...");
  rmSync(resolve(SQUID_DIR, "lib"), { recursive: true, force: true });
  rmSync(resolve(SQUID_DIR, "db/migrations"), { recursive: true, force: true });

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], SQUID_DIR);

  // Generate models from schema.graphql
  console.log("Generating models from schema...\n");
  await exec("pnpm", ["codegen"], SQUID_DIR);

  // Build TypeScript
  console.log("Building squid project...\n");
  await exec("pnpm", ["build"], SQUID_DIR);

  // Start Postgres via Docker
  console.log("Starting PostgreSQL database...\n");
  const squidEnv = {
    ...process.env,
    RPC_ENDPOINT: rpcUrl,
    DB_PORT: "23798",
    DB_HOST: "localhost",
    DB_NAME: "squid",
    DB_PASS: "postgres",
    GQL_PORT: String(BENCHMARK_PORT),
  };
  await exec("docker", ["compose", "down", "-v"], SQUID_DIR, squidEnv).catch(
    () => {}
  );
  await exec("docker", ["compose", "up", "-d"], SQUID_DIR, squidEnv);
  // Wait for Postgres to be ready
  await sleep(3_000);

  // Generate and apply migrations
  console.log("Generating migrations...\n");
  await exec(
    "npx",
    ["squid-typeorm-migration", "generate"],
    SQUID_DIR,
    squidEnv
  );
  console.log("Applying migrations...\n");
  await exec("npx", ["squid-typeorm-migration", "apply"], SQUID_DIR, squidEnv);

  const durationPromise = sleep(DURATION_S * 1_000);

  // Start the GraphQL server and processor as separate processes
  console.log(`\nStarting squid for ${DURATION_S}s...\n`);
  const gqlServer = start("npx", ["squid-graphql-server"], SQUID_DIR, squidEnv);
  const processor = start(
    "node",
    ["--require=dotenv/config", "lib/main.js"],
    SQUID_DIR,
    squidEnv
  );
  activeProc = processor;

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([waitReady(GRAPHQL_URL, QUERY, 60_000), durationPromise]);

  // Snapshot results
  const data: any = await gql(GRAPHQL_URL, QUERY);
  let blockData: any;
  try {
    blockData = await gql(GRAPHQL_URL, BLOCK_QUERY);
  } catch {}

  await kill(processor);
  await kill(gqlServer);
  activeProc = null;

  // Tear down Postgres
  try {
    await exec("docker", ["compose", "down"], SQUID_DIR, squidEnv);
  } catch {}

  // Compute metrics
  const totalEvents: number = data.transferEventsConnection?.totalCount ?? 0;

  // Extract the highest block number from the last transfer event ID (format: "blockHeight-logIndex")
  let totalBlocks = 0;
  const lastId = blockData?.transferEvents?.[0]?.id;
  if (lastId) {
    const blockHeight = parseInt(lastId.split("-")[0], 10);
    if (!isNaN(blockHeight)) {
      totalBlocks = blockHeight - START_BLOCK;
    }
  }

  return buildResult("Sqd", totalBlocks, totalEvents, DURATION_S);
}

// ── Main ───────────────────────────────────────────────────────────────

const BENCHMARKS: Record<string, (rpcUrl: string) => Promise<BenchmarkResult>> =
  {
    envio: benchmarkEnvio,
    "envio-rpc": benchmarkEnvioRpc,
    ponder: benchmarkPonder,
    rindexer: benchmarkRindexer,
    subquery: benchmarkSubQuery,
    sqd: benchmarkSqd,
  };

function formatRate(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

async function main() {
  // Parse positional args (benchmark names) — anything that isn't a flag
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const selected = positional.length > 0 ? positional : Object.keys(BENCHMARKS);

  // Validate names
  for (const name of selected) {
    if (!BENCHMARKS[name]) {
      console.error(
        `Unknown benchmark "${name}". Available: ${Object.keys(BENCHMARKS).join(
          ", "
        )}`
      );
      process.exit(1);
    }
  }

  // Validate ENVIO_API_TOKEN
  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("Error: ENVIO_API_TOKEN environment variable is required.");
    process.exit(1);
  }
  const rpcUrl = `https://1.rpc.hypersync.xyz/${apiToken}`;

  console.log("=== ERC20 Transfer Events Benchmark ===");
  console.log(`Duration: ${DURATION_S}s · Start block: ${START_BLOCK}`);
  console.log(`Running: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];

  // Add a "(40s)" suffix to the indexer name when the run window differs from
  // the baseline so the reader can see which entries are normalised over a
  // non-default duration.
  const labelWithDuration = (r: BenchmarkResult): string =>
    r.durationS === DURATION_S ? r.name : `${r.name} (${r.durationS}s)`;

  // Run selected benchmarks sequentially to avoid resource contention
  for (const name of selected) {
    const result = await BENCHMARKS[name](rpcUrl);
    results.push(result);
    await sleep(SUMMARY_DELAY_MS);
    console.log(
      `\nSummary — ${labelWithDuration(result)}: ${formatRate(
        result.blocksPerSec
      )} blocks/s, ${formatRate(result.eventsPerSec)} events/s\n`
    );
    await sleep(SUMMARY_DELAY_MS);
  }

  results.sort((a, b) => b.blocksPerSec - a.blocksPerSec);

  const firstRate = results[0].blocksPerSec;
  const nameWithSlower = (r: BenchmarkResult, i: number) => {
    if (i === 0 || results.length === 1) return r.name;
    const ratio = firstRate / r.blocksPerSec;
    const n = ratio % 1 === 0 ? String(Math.round(ratio)) : ratio.toFixed(1);
    return `${r.name} (${n}x slower)`;
  };

  // Print final results table
  console.log(`\n=== Results (sorted by blocks/s) ===\n`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`  ${nameWithSlower(r, i)}:`);
    console.log(`    Blocks : ${formatRate(r.blocksPerSec)}/s`);
    console.log(`    Events : ${formatRate(r.eventsPerSec)}/s`);
  }

  // Markdown comparison table: per-second rates only.
  const headerNames = results.map((r, i) => nameWithSlower(r, i));
  const header = ["| |", ...headerNames.map((name) => ` ${name} |`)].join("");
  const sep = ["| --- |", ...results.map(() => " --- |")].join("");
  const blocksRow = [
    "| blocks/s |",
    ...results.map((r) => ` ${formatRate(r.blocksPerSec)} |`),
  ].join("");
  const eventsRow = [
    "| events/s |",
    ...results.map((r) => ` ${formatRate(r.eventsPerSec)} |`),
  ].join("");

  console.log(`\n=== Markdown ===\n`);
  console.log([header, sep, blocksRow, eventsRow].join("\n"));
}

main().catch(async (err) => {
  console.error("\nBenchmark failed:", err);
  await cleanup();
  process.exit(1);
});
