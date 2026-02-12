// @ts-nocheck
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

// ── Config ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONDER_DIR = resolve(__dirname, "ponder");
const ENVIO_DIR = resolve(__dirname, "envio");
const RINDEXER_DIR = resolve(__dirname, "rindexer");
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

let activeProc: ChildProcess | null = null;

async function cleanup() {
  if (activeProc) {
    await kill(activeProc);
    activeProc = null;
  }
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

async function benchmarkPonder(
  childEnv: NodeJS.ProcessEnv
): Promise<BenchmarkResult> {
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
  const dev = start(
    "pnpm",
    ["ponder", "dev", "--disable-ui"],
    PONDER_DIR,
    childEnv
  );
  activeProc = dev;

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([waitReady(GRAPHQL_URL, QUERY), delayPromise]);

  // Snapshot results
  const data: any = await gql(GRAPHQL_URL, QUERY);
  await kill(dev);
  activeProc = null;

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

async function benchmarkEnvio(
  childEnv: NodeJS.ProcessEnv
): Promise<BenchmarkResult> {
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
  const envioEnv = {
    ...childEnv,
    TUI_OFF: "true",
  };
  console.log(`\nStarting envio dev for ${DURATION_S}s...\n`);
  await exec("pnpm", ["envio", "codegen"], ENVIO_DIR);
  const dev = start("pnpm", ["envio", "start", "-r"], ENVIO_DIR, envioEnv);
  activeProc = dev;

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([waitReady(GRAPHQL_URL, QUERY), durationPromise]);

  // Snapshot results
  const data: any = await gql(GRAPHQL_URL, QUERY);
  await kill(dev);
  activeProc = null;

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

async function benchmarkRindexer(
  childEnv: NodeJS.ProcessEnv
): Promise<BenchmarkResult> {
  const GRAPHQL_URL = "http://localhost:3001/graphql";
  // PostGraphile exposes allTransfers / allApprovals from the auto-generated schema.
  // rindexer names tables as <project>_<contract>.<event>, exposed via PostGraphile
  // as allErc20IndexerRocketTokenRethTransfers etc. We query the totalCount to get
  // event counts, and use the health endpoint to get block progress.
  const READY_QUERY = `{
    allErc20IndexerRocketTokenRethTransfers(first: 1) {
      totalCount
    }
  }`;

  console.log("\n--- Rindexer ---\n");

  // Install rindexer CLI if not already present
  console.log("Installing rindexer CLI...\n");
  await exec("bash", ["-c", "curl -L https://rindexer.xyz/install.sh | bash"], RINDEXER_DIR, childEnv);
  const rindexerBin = resolve(process.env.HOME ?? "~", ".rindexer", "bin", "rindexer");

  // Start PostgreSQL via docker compose
  console.log("Starting PostgreSQL via docker compose...");
  await exec("docker", ["compose", "up", "-d"], RINDEXER_DIR, childEnv);
  await sleep(3_000); // Wait for PostgreSQL to be ready

  const durationPromise = sleep(DURATION_S * 1_000);

  // Start rindexer (indexer + graphql)
  console.log(`\nStarting rindexer for ${DURATION_S}s...\n`);
  const dev = start(
    rindexerBin,
    ["start", "all"],
    RINDEXER_DIR,
    childEnv
  );
  activeProc = dev;

  // Wait for GraphQL to become ready, sleep concurrently
  await Promise.all([
    waitReady(GRAPHQL_URL, READY_QUERY, 60_000),
    durationPromise,
  ]);

  // Snapshot results — query event counts
  let totalEvents = 0;
  let totalBlocks = 0;
  try {
    const eventsQuery = `{
      allErc20IndexerRocketTokenRethTransfers {
        totalCount
      }
      allErc20IndexerRocketTokenRethApprovals {
        totalCount
      }
    }`;
    const data: any = await gql(GRAPHQL_URL, eventsQuery);
    const transfers: number =
      data.allErc20IndexerRocketTokenRethTransfers?.totalCount ?? 0;
    const approvals: number =
      data.allErc20IndexerRocketTokenRethApprovals?.totalCount ?? 0;
    totalEvents = transfers + approvals;
  } catch {
    // If PostGraphile schema differs, try simpler query patterns
    console.log("  Warning: Could not query event counts from GraphQL");
  }

  // Get block progress from health endpoint
  try {
    const healthRes = await fetch("http://localhost:8082/health");
    if (healthRes.ok) {
      const health: any = await healthRes.json();
      // rindexer health response includes indexing progress
      if (health?.last_synced_block != null) {
        totalBlocks = health.last_synced_block - START_BLOCK;
      }
    }
  } catch {
    console.log("  Warning: Could not query block progress from health endpoint");
  }

  await kill(dev);
  activeProc = null;

  // Stop PostgreSQL
  await exec("docker", ["compose", "down"], RINDEXER_DIR, childEnv);

  return {
    name: "Rindexer",
    totalEvents,
    totalBlocks,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

const BENCHMARKS: Record<
  string,
  (env: NodeJS.ProcessEnv) => Promise<BenchmarkResult>
> = {
  envio: benchmarkEnvio,
  ponder: benchmarkPonder,
  rindexer: benchmarkRindexer,
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
        `Unknown benchmark "${name}". Available: ${Object.keys(BENCHMARKS).join(", ")}`
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
  const childEnv = {
    ...process.env,
    PONDER_RPC_URL_1: rpcUrl,
    ENVIO_API_TOKEN: apiToken,
    ETHEREUM_RPC: rpcUrl,
    DATABASE_URL: "postgresql://postgres:rindexer@localhost:5440/postgres",
    POSTGRES_PASSWORD: "rindexer",
  };

  console.log("=== ERC20 Transfer Events Benchmark ===");
  console.log(`Duration: ${DURATION_S}s · Start block: ${START_BLOCK}`);
  console.log(`Running: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];

  // Run selected benchmarks sequentially to avoid resource contention
  for (const name of selected) {
    const result = await BENCHMARKS[name](childEnv);
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
