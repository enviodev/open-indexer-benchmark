// @ts-nocheck
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

// ── Config ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PONDER_DIR = resolve(__dirname, "ponder");
const START_BLOCK = 18_600_000;
const GRAPHQL_URL = "http://localhost:42069/graphql";

const DURATION_S = (() => {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  return flag ? parseInt(flag.split("=")[1], 10) : 180;
})();

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
async function gql<T = any>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
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

/** Poll the GraphQL endpoint until it responds. */
async function waitReady(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await gql(QUERY);
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error("GraphQL endpoint did not become ready within 30 s");
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

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  // Validate ENVIO_API_TOKEN
  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("Error: ENVIO_API_TOKEN environment variable is required.");
    process.exit(1);
  }
  const rpcUrl = `https://1.rpc.hypersync.xyz/${apiToken}`;
  const childEnv = { ...process.env, PONDER_RPC_URL_1: rpcUrl };

  console.log("=== ERC20 Transfer Events Benchmark ===");
  console.log(`Duration: ${DURATION_S}s · Start block: ${START_BLOCK}\n`);

  // 1. Clean previous state
  console.log("Cleaning .ponder cache…");
  rmSync(resolve(PONDER_DIR, ".ponder"), { recursive: true, force: true });

  // 2. Install deps
  console.log("Installing dependencies…\n");
  await exec("pnpm", ["install", "--frozen-lockfile"], PONDER_DIR);

  // 3. Start ponder dev (duration = indexing only)
  console.log(`\nStarting ponder dev for ${DURATION_S}s…\n`);
  const dev = start(
    "pnpm",
    ["ponder", "dev", "--disable-ui"],
    PONDER_DIR,
    childEnv
  );
  activeProc = dev;

  await sleep(DURATION_S * 1_000);

  // 4. Snapshot results right at the end of the indexing window, then stop
  const data: any = await gql(QUERY);
  await kill(dev);
  activeProc = null;

  // 6. Compute metrics
  const approvals: number = data.approvalEvents?.totalCount ?? 0;
  const transfers: number = data.transferEvents?.totalCount ?? 0;
  const totalEvents = approvals + transfers;
  const eventsPerSec = (totalEvents / DURATION_S).toFixed(1);

  // Derive blocks/s from _meta.status.<chain>.block.number
  let blocksPerSec: string | null = null;
  const chains = data._meta?.status;
  if (chains && typeof chains === "object") {
    for (const chain of Object.values(chains) as any[]) {
      if (chain?.block?.number != null) {
        const blocksProcessed = chain.block.number - START_BLOCK;
        blocksPerSec = (blocksProcessed / DURATION_S).toFixed(1);
        break;
      }
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`Transfer events : ${transfers}`);
  console.log(`Approval events : ${approvals}`);
  console.log(`Total events    : ${totalEvents}`);
  console.log(`Events/s        : ${eventsPerSec}`);
  if (blocksPerSec) console.log(`Blocks/s        : ${blocksPerSec}`);

  // 8. Markdown table
  const rows = [
    "| | Ponder |",
    "| --- | --- |",
    `| events/s | ${eventsPerSec} |`,
  ];
  if (blocksPerSec) {
    rows.splice(2, 0, `| blocks/s | ${blocksPerSec} |`);
  }

  console.log(`\n=== Markdown ===\n`);
  console.log(rows.join("\n"));
}

main().catch(async (err) => {
  console.error("\nBenchmark failed:", err);
  await cleanup();
  process.exit(1);
});
