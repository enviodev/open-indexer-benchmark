// @ts-nocheck
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

// ── Config ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONDER_DIR = resolve(__dirname, "ponder");
const ENVIO_DIR = resolve(__dirname, "envio");
const START_BLOCK = 18_600_000;

const DURATION_S = (() => {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  return flag ? parseInt(flag.split("=")[1], 10) : 180;
})();

// ── Types ──────────────────────────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  totalEvents: number;
  eventsPerSec: number;
  blocksPerSec: number | null;
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
  const eventsPerSec = totalEvents / DURATION_S;

  let blocksPerSec: number | null = null;
  const chains = data._meta?.status;
  if (chains && typeof chains === "object") {
    for (const chain of Object.values(chains) as any[]) {
      if (chain?.block?.number != null) {
        const blocksProcessed = chain.block.number - START_BLOCK;
        blocksPerSec = blocksProcessed / DURATION_S;
        break;
      }
    }
  }

  return {
    name: "Ponder",
    totalEvents,
    eventsPerSec,
    blocksPerSec,
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
  const envioEnv = { ...childEnv, TUI_OFF: "true" };
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
  const eventsPerSec = totalEvents / DURATION_S;

  let blocksPerSec: number | null = null;
  if (meta?.progressBlock != null) {
    const blocksProcessed = meta.progressBlock - START_BLOCK;
    blocksPerSec = blocksProcessed / DURATION_S;
  }

  return {
    name: "Envio",
    totalEvents,
    eventsPerSec,
    blocksPerSec,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
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
  };

  console.log("=== ERC20 Transfer Events Benchmark ===");
  console.log(`Duration: ${DURATION_S}s · Start block: ${START_BLOCK}\n`);

  const results: BenchmarkResult[] = [];

  // Run benchmarks sequentially to avoid resource contention
  results.push(await benchmarkEnvio(childEnv));
  results.push(await benchmarkPonder(childEnv));

  // Sort by events/s descending (best performance first)
  results.sort((a, b) => b.eventsPerSec - a.eventsPerSec);

  // Print summary
  console.log(`\n=== Results (sorted by events/s) ===\n`);
  for (const r of results) {
    console.log(`  ${r.name}:`);
    console.log(`    Total events    : ${r.totalEvents}`);
    console.log(`    Events/s        : ${r.eventsPerSec.toFixed(1)}`);
    if (r.blocksPerSec != null)
      console.log(`    Blocks/s        : ${r.blocksPerSec.toFixed(1)}`);
  }

  // Markdown comparison table
  const header = ["| |", ...results.map((r) => ` ${r.name} |`)].join("");
  const sep = ["| --- |", ...results.map(() => " --- |")].join("");
  const eventsRow = [
    "| events/s |",
    ...results.map((r) => ` ${r.eventsPerSec.toFixed(1)} |`),
  ].join("");
  const blocksRow = [
    "| blocks/s |",
    ...results.map((r) =>
      r.blocksPerSec != null ? ` ${r.blocksPerSec.toFixed(1)} |` : " — |"
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
