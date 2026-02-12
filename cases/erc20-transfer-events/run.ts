// @ts-nocheck
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync, existsSync } from "node:fs";

// ── Config ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONDER_DIR = resolve(__dirname, "ponder");
const ENVIO_DIR = resolve(__dirname, "envio");
const RINDEXER_DIR = resolve(__dirname, "rindexer");
const SQUID_DIR = resolve(__dirname, "sqd");
const START_BLOCK = 18_600_000;

const DURATION_S = (() => {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  return flag ? parseInt(flag.split("=")[1], 10) : 60;
})();

const SUMMARY_DELAY_MS = 3_000;

// ── Types ──────────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  totalEvents: number;
  totalBlocks: number;
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

// ── Cleanup on unexpected exit ─────────────────────────────────────────

let activeProcs: ChildProcess[] = [];

async function cleanup() {
  await Promise.all(activeProcs.map((p) => kill(p)));
  activeProcs = [];
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

async function benchmarkPonder(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = "http://localhost:42069/graphql";
  const QUERY = `{
    _meta {
      status
    }
    approvalEvents {
      totalCount
    }
    transferEvents {
      totalCount
    }
  }`;

  console.log("\n--- Ponder ---\n");

  // Clean previous state
  console.log("Cleaning .ponder cache...");
  rmSync(resolve(PONDER_DIR, ".ponder"), { recursive: true, force: true });

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], PONDER_DIR);

  const delayPromise = sleep(DURATION_S * 1_000);

  // Start ponder dev
  console.log(`\nStarting ponder dev for ${DURATION_S}s...\n`);
  const ponderEnv = { ...process.env, PONDER_RPC_URL_1: rpcUrl };
  const dev = start(
    "pnpm",
    ["ponder", "dev", "--disable-ui"],
    PONDER_DIR,
    ponderEnv
  );
  activeProcs = [dev];

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([waitReady(GRAPHQL_URL, QUERY), delayPromise]);

  // Snapshot results
  const data: any = await gql(GRAPHQL_URL, QUERY);
  await kill(dev);
  activeProcs = [];

  // Compute metrics
  const approvals: number = data.approvalEvents?.totalCount ?? 0;
  const transfers: number = data.transferEvents?.totalCount ?? 0;
  const totalEvents = approvals + transfers;

  let totalBlocks = 0;
  const chains = data._meta?.status;
  if (chains && typeof chains === "object") {
    for (const chain of Object.values(chains) as any[]) {
      if (chain?.block?.number != null) {
        totalBlocks = chain.block.number - START_BLOCK;
        break;
      }
    }
  }

  return {
    name: "Ponder",
    totalEvents,
    totalBlocks,
  };
}

// ── Envio Benchmark ────────────────────────────────────────────────────

async function benchmarkEnvio(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = "http://localhost:8080/v1/graphql";
  const QUERY = `{
    _meta {
      eventsProcessed
      progressBlock
    }
  }`;

  console.log("\n--- Envio ---\n");

  // Clean previous state
  console.log("Cleaning envio cache...");
  rmSync(resolve(ENVIO_DIR, "generated"), { recursive: true, force: true });

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], ENVIO_DIR);

  const durationPromise = sleep(DURATION_S * 1_000);

  // Start envio dev with TUI disabled
  const envioEnv = { ...process.env, TUI_OFF: "true" };
  console.log(`\nStarting envio dev for ${DURATION_S}s...\n`);
  await exec("pnpm", ["envio", "codegen"], ENVIO_DIR);
  const dev = start("pnpm", ["envio", "start", "-r"], ENVIO_DIR, envioEnv);
  activeProcs = [dev];

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([waitReady(GRAPHQL_URL, QUERY), durationPromise]);

  // Snapshot results
  const data: any = await gql(GRAPHQL_URL, QUERY);
  await kill(dev);
  activeProcs = [];

  // Compute metrics
  const meta = data._meta[0];
  const totalEvents: number = meta?.eventsProcessed ?? 0;
  const totalBlocks =
    meta?.progressBlock != null ? meta.progressBlock - START_BLOCK : 0;

  return {
    name: "Envio",
    totalEvents,
    totalBlocks,
  };
}

// ── Rindexer Benchmark ────────────────────────────────────────────────

async function benchmarkRindexer(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = "http://localhost:3001/graphql";
  const rindexerEnv = {
    ...process.env,
    ETHEREUM_RPC: rpcUrl,
    DATABASE_URL: "postgresql://postgres:rindexer@localhost:5440/postgres",
    POSTGRES_PASSWORD: "rindexer",
  };
  // PostGraphile exposes allTransfers / allApprovals from the auto-generated schema
  // (table names transfer, approval in schema erc_20indexer_rocket_token_reth).
  // We query totalCount for event counts and use the health endpoint for block progress.
  const READY_QUERY = `{
    allTransfers(first: 1) {
      totalCount
    }
  }`;

  console.log("\n--- Rindexer ---\n");

  // Install rindexer CLI if not already present
  const rindexerBin = resolve(
    process.env.HOME ?? "~",
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
  activeProcs = [dev];

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
      allApprovals {
        totalCount
      }
      lastTransfer: allTransfers(last: 1, orderBy: BLOCK_NUMBER_ASC) {
        nodes {
          blockNumber
        }
      }
      lastApproval: allApprovals(last: 1, orderBy: BLOCK_NUMBER_ASC) {
        nodes {
          blockNumber
        }
      }
    }`;
    const data: any = await gql(GRAPHQL_URL, resultsQuery);
    const transfers: number = data.allTransfers?.totalCount ?? 0;
    const approvals: number = data.allApprovals?.totalCount ?? 0;
    totalEvents = transfers + approvals;
    const transferBlock = Number(
      data.lastTransfer?.nodes?.[0]?.blockNumber ?? 0
    );
    const approvalBlock = Number(
      data.lastApproval?.nodes?.[0]?.blockNumber ?? 0
    );
    const maxBlock = Math.max(transferBlock, approvalBlock);
    if (maxBlock > START_BLOCK) {
      totalBlocks = maxBlock - START_BLOCK;
    }
  } catch {
    console.log("  Warning: Could not query results from GraphQL");
  }

  await kill(dev);
  activeProcs = [];

  // Stop PostgreSQL
  await exec("docker", ["compose", "down"], RINDEXER_DIR, rindexerEnv);

  return {
    name: "Rindexer",
    totalEvents,
    totalBlocks,
  };
}

// ── Squid Benchmark ───────────────────────────────────────────────────

async function benchmarkSquid(rpcUrl: string): Promise<BenchmarkResult> {
  const GRAPHQL_URL = "http://localhost:4350/graphql";
  const QUERY = `{
    transferEvents(orderBy: id_ASC, limit: 0) {
      totalCount
    }
    approvalEvents(orderBy: id_ASC, limit: 0) {
      totalCount
    }
    accounts(orderBy: id_ASC, limit: 1) {
      id
    }
  }`;

  // Query to detect the highest indexed block via the last transfer event
  const BLOCK_QUERY = `{
    transferEvents(orderBy: id_DESC, limit: 1) {
      id
    }
  }`;

  console.log("\n--- Squid ---\n");

  // Clean previous state
  console.log("Cleaning squid build artifacts...");
  rmSync(resolve(SQUID_DIR, "lib"), { recursive: true, force: true });

  // Install deps
  console.log("Installing dependencies...\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], SQUID_DIR);

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
  };
  await exec(
    "docker",
    ["compose", "up", "-d"],
    SQUID_DIR,
    squidEnv
  );
  // Wait for Postgres to be ready
  await sleep(3_000);

  // Apply migrations
  console.log("Applying migrations...\n");
  await exec(
    "npx",
    ["squid-typeorm-migration", "apply"],
    SQUID_DIR,
    squidEnv
  );

  const durationPromise = sleep(DURATION_S * 1_000);

  // Start the GraphQL server and processor as separate processes
  console.log(`\nStarting squid for ${DURATION_S}s...\n`);
  const gqlServer = start(
    "npx",
    ["squid-graphql-server"],
    SQUID_DIR,
    squidEnv
  );
  const processor = start(
    "node",
    ["--require=dotenv/config", "lib/main.js"],
    SQUID_DIR,
    squidEnv
  );
  activeProcs = [gqlServer, processor];

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
  activeProcs = [];

  // Tear down Postgres
  try {
    await exec("docker", ["compose", "down"], SQUID_DIR, squidEnv);
  } catch {}

  // Compute metrics
  const approvals: number = data.approvalEvents?.totalCount ?? 0;
  const transfers: number = data.transferEvents?.totalCount ?? 0;
  const totalEvents = approvals + transfers;

  // Extract the highest block number from the last transfer event ID (format: "blockHeight-logIndex")
  let totalBlocks = 0;
  const lastId = blockData?.transferEvents?.[0]?.id;
  if (lastId) {
    const blockHeight = parseInt(lastId.split("-")[0], 10);
    if (!isNaN(blockHeight)) {
      totalBlocks = blockHeight - START_BLOCK;
    }
  }

  return {
    name: "Squid",
    totalEvents,
    totalBlocks,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

const BENCHMARKS: Record<string, (rpcUrl: string) => Promise<BenchmarkResult>> =
  {
    envio: benchmarkEnvio,
    ponder: benchmarkPonder,
    rindexer: benchmarkRindexer,
    sqd: benchmarkSquid,
  };

function formatInt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
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

  // Run selected benchmarks sequentially to avoid resource contention
  for (const name of selected) {
    const result = await BENCHMARKS[name](rpcUrl);
    results.push(result);
    await sleep(SUMMARY_DELAY_MS);
    console.log(
      `\nSummary — ${result.name}: ${formatInt(
        result.totalBlocks
      )} blocks, ${formatInt(result.totalEvents)} events\n`
    );
    await sleep(SUMMARY_DELAY_MS);
  }

  // Compute per-second rates for sorting and table
  const withRates = results.map((r) => ({
    ...r,
    eventsPerSec: r.totalEvents / DURATION_S,
    blocksPerSec: r.totalBlocks / DURATION_S,
  }));
  withRates.sort((a, b) => b.blocksPerSec - a.blocksPerSec);

  const firstRate = withRates[0].blocksPerSec;
  const nameWithSlower = (r: (typeof withRates)[0], i: number) => {
    if (i === 0 || withRates.length === 1) return r.name;
    const ratio = firstRate / r.blocksPerSec;
    const n = ratio % 1 === 0 ? String(Math.round(ratio)) : ratio.toFixed(1);
    return `${r.name} (${n}x slower)`;
  };

  // Print final results table
  console.log(`\n=== Results (sorted by blocks/s) ===\n`);
  for (let i = 0; i < withRates.length; i++) {
    const r = withRates[i];
    console.log(`  ${nameWithSlower(r, i)}:`);
    console.log(
      `    Blocks : ${formatInt(r.totalBlocks)} (${r.blocksPerSec.toFixed(
        1
      )}/s)`
    );
    console.log(
      `    Events : ${formatInt(r.totalEvents)} (${r.eventsPerSec.toFixed(
        1
      )}/s)`
    );
  }

  // Markdown comparison table: whole numbers with per-second in parentheses
  const headerNames = withRates.map((r, i) => nameWithSlower(r, i));
  const header = ["| |", ...headerNames.map((name) => ` ${name} |`)].join("");
  const sep = ["| --- |", ...withRates.map(() => " --- |")].join("");
  const blocksRow = [
    "| blocks |",
    ...withRates.map(
      (r) => ` ${formatInt(r.totalBlocks)} (${r.blocksPerSec.toFixed(1)}/s) |`
    ),
  ].join("");
  const eventsRow = [
    "| events |",
    ...withRates.map(
      (r) => ` ${formatInt(r.totalEvents)} (${r.eventsPerSec.toFixed(1)}/s) |`
    ),
  ].join("");

  console.log(`\n=== Markdown ===\n`);
  console.log([header, sep, blocksRow, eventsRow].join("\n"));
}

main().catch(async (err) => {
  console.error("\nBenchmark failed:", err);
  await cleanup();
  process.exit(1);
});
