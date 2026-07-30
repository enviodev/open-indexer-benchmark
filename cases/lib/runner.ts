// Shared benchmark runner.
//
// Every indexer goes through the same two phases:
//
//   Phase A (verification) — index a small committed block range to
//     completion, then check the resulting database against the ground truth
//     and measure how much disk the indexed data occupies. Both metrics are
//     only comparable when every indexer holds exactly the same data, which is
//     what a bounded range guarantees and a fixed time window cannot.
//
//   Phase B (throughput) — only for indexers that finished phase A in under
//     the benchmark window. Wipe state and re-run with an end block just below
//     the chain head, stopping at whichever comes first: the window elapsing or
//     the end block being reached. The window is run more than once and the
//     best rate reported, because a single window on a shared CI runner is
//     noisy enough to reorder the middle of the table. Indexers too slow to
//     finish phase A in the window instead have their rate derived from phase
//     A, where the range and event count are known exactly.
//
// Stopping below the chain head keeps every indexer on the same footing: the
// fastest ones would otherwise catch up mid-window and spend the rest of it
// measuring head tracking rather than backfill.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseConfig } from "./case.ts";
import type { Expected } from "./checksum.ts";
import { fetchChainHeight, fetchLogs } from "./hypersync.ts";
import { type BenchmarkResult, toTableRow } from "./result.ts";
import { buildTable, formatBytes, formatRate } from "./table.ts";
import { verify, type Verification } from "./verify.ts";

// ── Constants ──────────────────────────────────────────────────────────

const BENCHMARK_PORT = 19_876;

const HYPERSYNC_URL = "https://docs.envio.dev/docs/HyperSync/overview";
const HYPERRPC_URL = "https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc";
const SQD_NETWORK_URL = "https://docs.sqd.ai/subsquid-network/overview/";

/**
 * Where each tool's project lives and which network it reads chain data from.
 * Tools without their own data source read from Envio HyperRPC, so the source
 * column distinguishes a tool's own pipeline from a plain RPC endpoint.
 */
const TOOLS: Record<
  keyof typeof DRIVERS,
  { toolUrl: string; source: string; sourceUrl: string; storage: string }
> = {
  envio: {
    toolUrl: "https://envio.dev",
    source: "HyperSync",
    sourceUrl: HYPERSYNC_URL,
    storage: "Postgres",
  },
  "envio-rpc": {
    toolUrl: "https://envio.dev",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  ponder: {
    toolUrl: "https://ponder.sh",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  rindexer: {
    toolUrl: "https://rindexer.xyz",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
  sqd: {
    toolUrl: "https://www.sqd.ai",
    source: "SQD",
    sourceUrl: SQD_NETWORK_URL,
    storage: "Postgres",
  },
  subquery: {
    toolUrl: "https://subquery.network",
    source: "RPC",
    sourceUrl: HYPERRPC_URL,
    storage: "Postgres",
  },
};

/**
 * How far below the chain head the throughput run stops. Keeps the whole run
 * in the backfill path, clear of each indexer's unfinalised-block handling.
 */
const HEAD_OFFSET = 500;

/** Give up on the verification range after this long and report no result. */
const PHASE_A_TIMEOUT_S = 900;

/**
 * How many throughput windows to run for indexers fast enough to get one.
 * A single window is noticeably noisy on shared CI runners — repeat rates have
 * been seen to differ by ~30% — so the window is run more than once and the
 * best result is reported. Interference only ever slows a run down, so the
 * fastest of the samples is the one least polluted by it.
 */
const THROUGHPUT_RUNS = 2;

const ENVIO_PG_PORT = 5433;
const ENVIO_DB_URL = `postgresql://postgres:testing@localhost:${ENVIO_PG_PORT}/envio-dev`;
const PONDER_PG_PORT = 19_877;
const PONDER_PG_CONTAINER = "ponder-benchmark-pg";
const PONDER_DB_URL = `postgresql://postgres:postgres@localhost:${PONDER_PG_PORT}/ponder`;
const RINDEXER_PG_PORT = 5440;
const RINDEXER_DB_URL = `postgresql://postgres:rindexer@localhost:${RINDEXER_PG_PORT}/postgres`;
const SQD_PG_PORT = 23_798;
const SQD_DB_URL = `postgresql://postgres:postgres@localhost:${SQD_PG_PORT}/squid`;
const SUBQUERY_PG_PORT = 5432;
const SUBQUERY_DB_URL = `postgresql://postgres:postgres@localhost:${SUBQUERY_PG_PORT}/postgres`;

// ── Types ──────────────────────────────────────────────────────────────

interface Snapshot {
  /** Blocks indexed past the case's start block. */
  blocks: number;
  events: number;
}

interface Driver {
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

interface Ctx {
  config: CaseConfig;
  rpcUrl: string;
  endBlock: number;
}

type DriverFactory = (ctx: Ctx) => Driver;

// ── Process helpers ────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run a command to completion, inheriting stdio. */
function exec(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env });
    p.on("exit", (code) =>
      code === 0
        ? res()
        : rej(new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`))
    );
  });
}

/** Spawn a long-running process, forwarding output with an indent. */
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
function kill(proc: ChildProcess | null): Promise<void> {
  if (!proc?.pid || proc.exitCode !== null) return Promise.resolve();
  const pid = proc.pid;
  return new Promise((res) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
      res();
    }, 5_000);
    proc.on("exit", () => {
      clearTimeout(timer);
      res();
    });
    try {
      process.kill(-pid, "SIGTERM");
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
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

/** Run a SQL query via psql and return the trimmed stdout. */
function psql(connStr: string, query: string): Promise<string> {
  return new Promise((res, rej) => {
    const p = spawn("psql", [connStr, "-t", "-A", "-c", query], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    p.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    p.on("exit", (code) =>
      code === 0 ? res(stdout.trim()) : rej(new Error(`psql failed (${code}): ${stderr}`))
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

let activeDriver: Driver | null = null;

async function cleanup() {
  if (!activeDriver) return;
  const driver = activeDriver;
  activeDriver = null;
  try {
    await driver.stop();
  } catch {}
  try {
    await driver.cleanup();
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

// ── Drivers ────────────────────────────────────────────────────────────

const ponderDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "ponder");
  const env = {
    ...process.env,
    PONDER_RPC_URL_1: rpcUrl,
    DATABASE_URL: PONDER_DB_URL,
    PONDER_END_BLOCK: String(endBlock),
  };
  let proc: ChildProcess | null = null;
  let done = false;

  return {
    name: "Ponder",
    dbUrl: PONDER_DB_URL,
    async prepare() {
      console.log("Cleaning .ponder cache...");
      rmSync(resolve(dir, ".ponder"), { recursive: true, force: true });

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);

      console.log("Starting PostgreSQL for Ponder...");
      await exec("docker", ["rm", "-f", PONDER_PG_CONTAINER], dir).catch(() => {});
      await exec(
        "docker",
        [
          "run", "-d", "--name", PONDER_PG_CONTAINER,
          "-e", "POSTGRES_PASSWORD=postgres",
          "-e", "POSTGRES_DB=ponder",
          "-p", `${PONDER_PG_PORT}:5432`,
          "postgres:17-alpine",
        ],
        dir
      );
      await waitPg(PONDER_DB_URL, "SELECT 1");
    },
    async launch() {
      // The production command: builds once and ignores file changes, where
      // `dev` watches the filesystem and hot-reloads. `start` rejects
      // `--disable-ui` (a dev-only flag) and refuses to boot without an
      // explicit schema, so both differ from the dev invocation. `public` keeps
      // the entity tables on the default search path, where snapshot() reads
      // them unqualified.
      proc = start(
        "pnpm",
        ["ponder", "start", `--port=${BENCHMARK_PORT}`, "--schema=public"],
        dir,
        env
      );
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      const [counts, checkpoint] = await Promise.all([
        Promise.all(
          config.ponderTables.map((table) =>
            psql(PONDER_DB_URL, `SELECT count(*) FROM ${table}`)
          )
        ),
        psql(
          PONDER_DB_URL,
          'SELECT "latest_checkpoint" FROM _ponder_checkpoint LIMIT 1'
        ).catch(() => ""),
      ]);
      const events = counts.reduce((sum, c) => sum + (parseInt(c, 10) || 0), 0);
      // Checkpoint is a 75-char string: [10 timestamp][16 chainId][16 blockNumber]…
      const block =
        checkpoint.length >= 42 ? Number(BigInt(checkpoint.slice(26, 42))) : 0;
      return {
        events,
        blocks: block > config.startBlock ? block - config.startBlock : 0,
      };
    },
    async stop() {
      await kill(proc);
      proc = null;
    },
    async cleanup() {
      await exec("docker", ["rm", "-f", PONDER_PG_CONTAINER], dir).catch(() => {});
    },
    exited: () => done,
  };
};

const envioDriver = (mode: "hypersync" | "rpc"): DriverFactory => ({
  config,
  rpcUrl,
  endBlock,
}) => {
  const dir = resolve(config.dir, "envio");
  const env = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_HASURA: "false",
    ENVIO_PG_PORT: String(ENVIO_PG_PORT),
    ENVIO_RPC_URL: rpcUrl,
    ENVIO_RPC_FOR: mode === "rpc" ? "sync" : "fallback",
    ENVIO_END_BLOCK: String(endBlock),
  };
  let proc: ChildProcess | null = null;
  let done = false;

  return {
    name: "Envio Indexer",
    dbUrl: ENVIO_DB_URL,
    async prepare() {
      console.log("Cleaning envio cache...");
      rmSync(resolve(dir, ".envio"), { recursive: true, force: true });

      // Envio is the only driver that reuses one database across phases, and
      // `envio start -r` resets it asynchronously after launch. A snapshot taken
      // before that reset lands reads the previous phase's progress — and when
      // the previous phase reached its end block, that stale reading satisfies
      // the completion check immediately and yields an absurd rate. Drop the
      // schema up front so no prior state can be observed at all.
      await psql(ENVIO_DB_URL, "DROP SCHEMA IF EXISTS public CASCADE").catch(
        () => {}
      );
      await psql(ENVIO_DB_URL, "CREATE SCHEMA public").catch(() => {});

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);
      await exec("pnpm", ["envio", "codegen"], dir, env);
    },
    async launch() {
      // `-r` resets the database, so each phase starts from a clean state.
      proc = start("pnpm", ["envio", "start", "-r"], dir, env);
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      const row = await psql(
        ENVIO_DB_URL,
        "SELECT events_processed, progress_block FROM public.envio_chains LIMIT 1"
      );
      const [eventsStr, blockStr] = row.split("|");
      const events = parseInt(eventsStr, 10) || 0;
      const block = parseInt(blockStr, 10) || 0;
      return {
        events,
        blocks: block > config.startBlock ? block - config.startBlock : 0,
      };
    },
    async stop() {
      await kill(proc);
      proc = null;
    },
    async cleanup() {},
    exited: () => done,
  };
};

const rindexerDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "rindexer");
  const graphqlUrl = `http://localhost:${BENCHMARK_PORT}/graphql`;
  const env = {
    ...process.env,
    ETHEREUM_RPC: rpcUrl,
    DATABASE_URL: RINDEXER_DB_URL,
    POSTGRES_PASSWORD: "rindexer",
    RINDEXER_END_BLOCK: String(endBlock),
  };
  const bin = resolve(
    process.env.HOME ?? "~",
    ".config",
    ".rindexer",
    "bin",
    "rindexer"
  );
  let proc: ChildProcess | null = null;
  let done = false;

  const snapshotQuery = `{
    ${config.rindexerCollections
      .map((c, i) => `count${i}: ${c} { totalCount }`)
      .join("\n    ")}
    ${config.rindexerCollections
      .map(
        (c, i) =>
          `last${i}: ${c}(last: 1, orderBy: BLOCK_NUMBER_ASC) { nodes { blockNumber } }`
      )
      .join("\n    ")}
  }`;

  return {
    name: "Rindexer",
    dbUrl: RINDEXER_DB_URL,
    async prepare() {
      if (!existsSync(bin)) {
        console.log("Installing rindexer CLI...\n");
        // install.sh resolves "latest" via an unauthenticated GitHub API call
        // that is occasionally throttled (empty version -> 404 download).
        // Retry so a transient hiccup doesn't fail the whole benchmark.
        await exec(
          "bash",
          [
            "-c",
            "for i in 1 2 3; do curl -L https://rindexer.xyz/install.sh | bash && break; " +
              'echo "rindexer install attempt $i failed; retrying..." >&2; sleep $((i * 5)); done',
          ],
          dir,
          env
        );
      }

      console.log("Starting PostgreSQL via docker compose...");
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
      await exec("docker", ["compose", "up", "-d"], dir, env);
      await waitPg(RINDEXER_DB_URL, "SELECT 1");
    },
    async launch() {
      proc = start(bin, ["start", "all"], dir, env);
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      const data: any = await gql(graphqlUrl, snapshotQuery);
      let events = 0;
      let maxBlock = 0;
      for (let i = 0; i < config.rindexerCollections.length; i++) {
        events += data[`count${i}`]?.totalCount ?? 0;
        maxBlock = Math.max(
          maxBlock,
          Number(data[`last${i}`]?.nodes?.[0]?.blockNumber ?? 0)
        );
      }
      return {
        events,
        blocks: maxBlock > config.startBlock ? maxBlock - config.startBlock : 0,
      };
    },
    async stop() {
      await kill(proc);
      proc = null;
    },
    async cleanup() {
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
    },
    exited: () => done,
  };
};

const sqdDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "sqd");
  const graphqlUrl = `http://localhost:${BENCHMARK_PORT}/graphql`;
  const env = {
    ...process.env,
    RPC_ENDPOINT: rpcUrl,
    DB_PORT: String(SQD_PG_PORT),
    DB_HOST: "localhost",
    DB_NAME: "squid",
    DB_PASS: "postgres",
    GQL_PORT: String(BENCHMARK_PORT),
    SQD_END_BLOCK: String(endBlock),
  };
  let processor: ChildProcess | null = null;
  let gqlServer: ChildProcess | null = null;
  let done = false;

  // "transferEventsConnection" exposes totalCount; "transferEvents" is the
  // plain collection used to read the highest indexed block from the last id.
  const blockField = config.sqdConnections[0].replace(/Connection$/, "");
  const snapshotQuery = `{
    ${config.sqdConnections
      .map((c, i) => `count${i}: ${c}(orderBy: id_ASC) { totalCount }`)
      .join("\n    ")}
    latest: ${blockField}(orderBy: id_DESC, limit: 1) { id }
  }`;

  return {
    name: "Sqd",
    dbUrl: SQD_DB_URL,
    async prepare() {
      console.log("Cleaning squid build artifacts...");
      rmSync(resolve(dir, "lib"), { recursive: true, force: true });
      rmSync(resolve(dir, "db/migrations"), { recursive: true, force: true });

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);
      console.log("Generating models from schema...\n");
      await exec("pnpm", ["codegen"], dir);
      console.log("Building squid project...\n");
      await exec("pnpm", ["build"], dir);

      console.log("Starting PostgreSQL database...\n");
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
      await exec("docker", ["compose", "up", "-d"], dir, env);
      await waitPg(SQD_DB_URL, "SELECT 1");

      console.log("Generating migrations...\n");
      await exec("npx", ["squid-typeorm-migration", "generate"], dir, env);
      console.log("Applying migrations...\n");
      await exec("npx", ["squid-typeorm-migration", "apply"], dir, env);
    },
    async launch() {
      gqlServer = start("npx", ["squid-graphql-server"], dir, env);
      processor = start(
        "node",
        ["--require=dotenv/config", "lib/main.js"],
        dir,
        env
      );
      // The processor exits by itself once it reaches its end block.
      processor.on("exit", () => (done = true));
    },
    async snapshot() {
      const data: any = await gql(graphqlUrl, snapshotQuery);
      let events = 0;
      for (let i = 0; i < config.sqdConnections.length; i++) {
        events += data[`count${i}`]?.totalCount ?? 0;
      }
      // Event ids are "<blockHeight>-<logIndex>"; within a single benchmark the
      // heights all have the same digit count, so id_DESC orders by height.
      const lastId: string | undefined = data.latest?.[0]?.id;
      const block = lastId ? parseInt(lastId.split("-")[0], 10) : 0;
      return {
        events,
        blocks:
          Number.isFinite(block) && block > config.startBlock
            ? block - config.startBlock
            : 0,
      };
    },
    async stop() {
      await kill(processor);
      await kill(gqlServer);
      processor = null;
      gqlServer = null;
    },
    async cleanup() {
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
    },
    exited: () => done,
  };
};

const subqueryDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "subquery");
  const graphqlUrl = `http://localhost:${BENCHMARK_PORT}`;
  const env = {
    ...process.env,
    ETHEREUM_RPC_URL: rpcUrl,
    SUBQUERY_END_BLOCK: String(endBlock),
  };
  let proc: ChildProcess | null = null;
  let done = false;

  const snapshotQuery = `{
    _metadata { lastProcessedHeight }
    ${config.subqueryCollections
      .map((c, i) => `count${i}: ${c} { totalCount }`)
      .join("\n    ")}
  }`;

  return {
    name: "SubQuery",
    dbUrl: SUBQUERY_DB_URL,
    async prepare() {
      console.log("Cleaning subquery cache...");
      rmSync(resolve(dir, ".data"), { recursive: true, force: true });
      rmSync(resolve(dir, "dist"), { recursive: true, force: true });
      rmSync(resolve(dir, "src/types"), { recursive: true, force: true });

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);

      // project.ts reads the RPC URL and end block from the environment and
      // bakes them into project.yaml, so both must be set for these two steps.
      console.log("Running codegen and build...\n");
      await exec("pnpm", ["codegen"], dir, env);
      await exec("pnpm", ["build"], dir, env);

      writeFileSync(resolve(dir, ".env"), `ETHEREUM_RPC_URL=${rpcUrl}\n`);

      console.log("Cleaning previous docker state...");
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});

      // Image pulls and database startup happen before the measured window.
      console.log("Pulling images and starting postgres...");
      await exec("docker", ["compose", "pull"], dir, env);
      await exec("docker", ["compose", "up", "-d", "postgres"], dir, env);
      await waitPg(SUBQUERY_DB_URL, "SELECT 1", 60_000);
    },
    async launch() {
      proc = start("docker", ["compose", "up", "--remove-orphans"], dir, env);
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      const data: any = await gql(graphqlUrl, snapshotQuery);
      let events = 0;
      for (let i = 0; i < config.subqueryCollections.length; i++) {
        events += data[`count${i}`]?.totalCount ?? 0;
      }
      const height = Number(data._metadata?.lastProcessedHeight ?? 0);
      return {
        events,
        blocks: height > config.startBlock ? height - config.startBlock : 0,
      };
    },
    async stop() {
      await kill(proc);
      proc = null;
      // Killing the foreground `compose up` takes the whole project down with
      // it, including the database that still has to be verified. Bring just
      // postgres back; it is idempotent when the container survived.
      await exec("docker", ["compose", "up", "-d", "postgres"], dir, env).catch(
        () => {}
      );
      await waitPg(SUBQUERY_DB_URL, "SELECT 1", 30_000).catch(() => {});
    },
    async cleanup() {
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
    },
    exited: () => done,
  };
};

const DRIVERS: Record<string, DriverFactory> = {
  envio: envioDriver("hypersync"),
  "envio-rpc": envioDriver("rpc"),
  ponder: ponderDriver,
  rindexer: rindexerDriver,
  subquery: subqueryDriver,
  sqd: sqdDriver,
};

export const INDEXERS = Object.keys(DRIVERS);

// ── Phase execution ────────────────────────────────────────────────────

interface PhaseOutcome {
  blocks: number;
  events: number;
  elapsedS: number;
  /** Reached the end block (or the expected event count) before running out of time. */
  completed: boolean;
}

/**
 * Run one phase to either completion or the time limit, whichever comes first.
 *
 * Progress is polled rather than sampled once at the end, because a phase can
 * finish early. Polling is slow (1s) until the indexer is close to the target,
 * then fast (200ms), which keeps the query overhead off the measurement while
 * still timing an early finish tightly.
 */
async function runPhase(
  driver: Driver,
  opts: { targetBlocks: number; targetEvents: number; maxSeconds: number }
): Promise<PhaseOutcome> {
  const { targetBlocks, targetEvents, maxSeconds } = opts;

  await driver.launch();
  const startedAt = performance.now();
  const deadline = startedAt + maxSeconds * 1_000;

  let last: Snapshot = { blocks: 0, events: 0 };

  // Progress is read as an absolute position, so anything left over from a
  // previous phase would be counted as work done in this one. Every driver is
  // supposed to start from an empty database; say so loudly if one does not,
  // rather than silently reporting a rate for work it never did.
  try {
    const baseline = await driver.snapshot();
    if (baseline && (baseline.blocks > 0 || baseline.events > 0)) {
      console.log(
        `  Warning: ${driver.name} already reports ${baseline.blocks.toLocaleString(
          "en-US"
        )} blocks / ${baseline.events.toLocaleString("en-US")} events at launch — ` +
          `its database was not empty, so this run's rate is not trustworthy.`
      );
    }
  } catch {
    // Not queryable yet, which is the normal case for a clean start.
  }

  while (performance.now() < deadline) {
    // Exiting is a reason to stop waiting, not evidence of success: an indexer
    // that crashed on startup exits too. Completion is decided below, from the
    // progress actually recorded.
    if (
      last.blocks >= targetBlocks ||
      last.events >= targetEvents ||
      driver.exited()
    ) {
      break;
    }
    const remaining = Math.max(0, targetBlocks - last.blocks) / targetBlocks;
    await sleep(remaining < 0.05 ? 200 : 1_000);
    try {
      last = (await driver.snapshot()) ?? last;
    } catch {
      // Not queryable yet, or briefly unavailable — keep the previous reading.
    }
  }

  // Take the final reading and stamp the elapsed time from the same moment, so
  // the reported rate is internally consistent.
  try {
    last = (await driver.snapshot()) ?? last;
  } catch {}
  const elapsedS = (performance.now() - startedAt) / 1_000;
  const completed = last.blocks >= targetBlocks || last.events >= targetEvents;

  return { blocks: last.blocks, events: last.events, elapsedS, completed };
}

// ── Benchmark ──────────────────────────────────────────────────────────

/**
 * Assemble a result from the parts that vary. Every exit reports the same
 * fourteen fields, and building them in one place means a new field cannot be
 * added to two of the three paths and forgotten in the third.
 */
function buildResult(
  key: string,
  verification: Verification,
  parts: {
    name: string;
    blocks: number;
    events: number;
    seconds: number;
    throughputSource: BenchmarkResult["throughputSource"];
    rangeSeconds: number | null;
    windowSeconds: number | null;
    windowRuns?: BenchmarkResult["windowRuns"];
  }
): BenchmarkResult {
  const { seconds } = parts;
  return {
    name: parts.name,
    ...TOOLS[key],
    blocksPerSec: seconds > 0 ? parts.blocks / seconds : 0,
    eventsPerSec: seconds > 0 ? parts.events / seconds : 0,
    throughputSource: parts.throughputSource,
    correctness: verification.status,
    correctnessDetail: verification.detail,
    dbSizeBytes: verification.dbSizeBytes,
    dbTotalBytes: verification.dbTotalBytes,
    rangeSeconds: parts.rangeSeconds,
    windowSeconds: parts.windowSeconds,
    ...(parts.windowRuns ? { windowRuns: parts.windowRuns } : {}),
  };
}

async function benchmarkIndexer(
  key: string,
  config: CaseConfig,
  expected: Expected,
  rpcUrl: string,
  apiToken: string,
  windowS: number,
  headEndBlock: number
): Promise<BenchmarkResult> {
  const factory = DRIVERS[key];
  // Two different quantities that differ by one. The inclusive range holds
  // this many blocks, which is what the rate is computed over…
  const rangeBlocks = config.verifyEndBlock - config.startBlock + 1;
  // …while snapshots report `latestIndexedBlock - startBlock`, so reaching the
  // final block yields one less than that. Comparing progress against the
  // inclusive count would mean block-based completion could never fire, leaving
  // completion to hinge entirely on the event count matching exactly.
  const rangeTargetBlocks = config.verifyEndBlock - config.startBlock;

  // ── Phase A: bounded verification run ──
  const phaseA = factory({ config, rpcUrl, endBlock: config.verifyEndBlock });
  activeDriver = phaseA;
  console.log(`\n--- ${phaseA.name} — verification range ---\n`);
  console.log(
    `Indexing blocks ${config.startBlock.toLocaleString(
      "en-US"
    )}–${config.verifyEndBlock.toLocaleString("en-US")} ` +
      `(${expected.totalEvents.toLocaleString("en-US")} events expected)\n`
  );

  await phaseA.prepare();
  const rangeRun = await runPhase(phaseA, {
    targetBlocks: rangeTargetBlocks,
    targetEvents: expected.totalEvents,
    maxSeconds: PHASE_A_TIMEOUT_S,
  });
  await phaseA.stop();

  let verification: Verification;
  if (rangeRun.completed) {
    console.log(
      `\nIndexed the range in ${rangeRun.elapsedS.toFixed(1)}s — verifying...`
    );
    verification = await verify(
      (query) => psql(phaseA.dbUrl, query),
      config.entities,
      expected,
      {
        // Only reached when something mismatched: rebuild the expected rows so
        // the report can name what differs instead of just that a checksum did.
        fetchExpectedRows: async () => {
          console.log("  Mismatch found — rebuilding ground truth to diff it...");
          const logs = await fetchLogs({
            token: apiToken,
            address: config.contract,
            topics: config.topics,
            fromBlock: config.startBlock,
            toBlock: config.verifyEndBlock,
          });
          return config.computeExpected(logs).entities;
        },
      }
    );
    console.log(`  ${verification.status}: ${verification.detail}`);
    for (const entity of verification.entities) {
      for (const example of entity.examples) console.log(`    ${example}`);
    }
  } else {
    // Verifying a partial database would report missing rows, which reads as a
    // data bug rather than what it is: the indexer ran out of time.
    const timedOut = rangeRun.elapsedS >= PHASE_A_TIMEOUT_S - 1;
    verification = {
      status: "unknown",
      detail: timedOut
        ? `did not finish the verification range within ${PHASE_A_TIMEOUT_S}s`
        : `stopped after ${rangeRun.elapsedS.toFixed(0)}s having indexed ` +
          `${rangeRun.events.toLocaleString("en-US")} of ` +
          `${expected.totalEvents.toLocaleString("en-US")} events — ` +
          `the indexer exited before completing the range`,
      entities: [],
      dbSizeBytes: null,
      dbTotalBytes: null,
    };
    console.log(`\n  ${verification.detail}`);
  }

  await phaseA.cleanup();
  activeDriver = null;

  // ── Phase B: throughput window ──
  // Only worth running when the indexer got through the verification range in
  // less than the window; otherwise phase A already measured its rate over a
  // range whose size and event count are known exactly.
  const runWindow = rangeRun.completed && rangeRun.elapsedS < windowS;

  if (!runWindow) {
    const seconds = rangeRun.elapsedS;
    const blocks = rangeRun.completed ? rangeBlocks : rangeRun.blocks;
    const events = rangeRun.completed ? expected.totalEvents : rangeRun.events;
    console.log(
      `\n${phaseA.name}: slower than the ${windowS}s window over the ` +
        `verification range — reporting its rate from that run.\n`
    );
    return buildResult(key, verification, {
      name: phaseA.name,
      blocks,
      events,
      seconds,
      throughputSource: "range",
      rangeSeconds: rangeRun.completed ? rangeRun.elapsedS : null,
      windowSeconds: null,
    });
  }

  const windowRuns: {
    eventsPerSec: number;
    blocksPerSec: number;
    seconds: number;
  }[] = [];
  let name = phaseA.name;

  for (let attempt = 1; attempt <= THROUGHPUT_RUNS; attempt++) {
    const phaseB = factory({ config, rpcUrl, endBlock: headEndBlock });
    activeDriver = phaseB;
    name = phaseB.name;
    console.log(
      `\n--- ${phaseB.name} — throughput (run ${attempt} of ${THROUGHPUT_RUNS}) ---\n`
    );
    console.log(
      `Running for up to ${windowS}s, stopping at block ${headEndBlock.toLocaleString(
        "en-US"
      )}\n`
    );

    await phaseB.prepare();
    const windowRun = await runPhase(phaseB, {
      targetBlocks: headEndBlock - config.startBlock,
      targetEvents: Number.POSITIVE_INFINITY,
      maxSeconds: windowS,
    });
    // The end block sits millions of blocks ahead, so nothing reaches it inside
    // the window: exiting without completing means the indexer died. Whatever
    // partial work it did is not a throughput measurement, and keeping it risks
    // publishing a rate from a broken run.
    const died = phaseB.exited() && !windowRun.completed;
    await phaseB.stop();
    await phaseB.cleanup();
    activeDriver = null;

    if (died) {
      console.log(
        `\nRun ${attempt}: the indexer exited after ${windowRun.elapsedS.toFixed(
          1
        )}s without reaching the end block — discarding this sample.\n`
      );
      continue;
    }

    if (windowRun.completed) {
      console.log(
        `\nReached the end block after ${windowRun.elapsedS.toFixed(
          1
        )}s — rate computed over that time.`
      );
    }

    const seconds = windowRun.elapsedS;
    const run = {
      eventsPerSec: seconds > 0 ? windowRun.events / seconds : 0,
      blocksPerSec: seconds > 0 ? windowRun.blocks / seconds : 0,
      seconds,
    };
    windowRuns.push(run);
    console.log(
      `Run ${attempt}: ${formatRate(run.eventsPerSec)} events/s, ${formatRate(
        run.blocksPerSec
      )} blocks/s\n`
    );
  }

  // Every throughput run died. Phase A completed, so its rate is still sound —
  // fall back to it rather than reporting nothing or a rate from a broken run.
  if (windowRuns.length === 0) {
    console.log(
      `\n${name}: no throughput run survived — reporting the rate from the ` +
        `verification range instead.\n`
    );
    return buildResult(key, verification, {
      name,
      blocks: rangeBlocks,
      events: expected.totalEvents,
      seconds: rangeRun.elapsedS,
      throughputSource: "range",
      rangeSeconds: rangeRun.elapsedS,
      windowSeconds: null,
    });
  }

  // Report the best sample. Contention on a shared runner only ever costs
  // throughput, so the fastest run is the one least distorted by it.
  const best = windowRuns.reduce((a, b) => (b.eventsPerSec > a.eventsPerSec ? b : a));
  const spread =
    Math.max(...windowRuns.map((r) => r.eventsPerSec)) -
    Math.min(...windowRuns.map((r) => r.eventsPerSec));
  if (best.eventsPerSec > 0) {
    console.log(
      `Spread across ${THROUGHPUT_RUNS} runs: ${(
        (spread / best.eventsPerSec) *
        100
      ).toFixed(1)}% of the best rate\n`
    );
  }

  return buildResult(key, verification, {
    name,
    blocks: best.blocksPerSec * best.seconds,
    events: best.eventsPerSec * best.seconds,
    seconds: best.seconds,
    throughputSource: "window",
    rangeSeconds: rangeRun.elapsedS,
    windowSeconds: best.seconds,
    windowRuns,
  });
}

// ── Result presentation ────────────────────────────────────────────────

// ── Entry point ────────────────────────────────────────────────────────

export async function runBenchmark(config: CaseConfig) {
  try {
    await run(config);
  } catch (err) {
    console.error("\nBenchmark failed:", err);
    await cleanup();
    process.exit(1);
  }
}

async function run(config: CaseConfig) {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const selected = positional.length > 0 ? positional : INDEXERS;

  for (const name of selected) {
    if (!DRIVERS[name]) {
      console.error(
        `Unknown benchmark "${name}". Available: ${INDEXERS.join(", ")}`
      );
      process.exit(1);
    }
  }

  const durationFlag = process.argv.find((a) => a.startsWith("--duration="));
  const windowS = durationFlag ? parseInt(durationFlag.split("=")[1], 10) : 60;

  const apiToken = process.env.ENVIO_API_TOKEN;
  if (!apiToken) {
    console.error("Error: ENVIO_API_TOKEN environment variable is required.");
    process.exit(1);
  }
  const rpcUrl = `https://1.rpc.hypersync.xyz/${apiToken}`;

  const expected: Expected = JSON.parse(
    readFileSync(resolve(config.dir, "expected.json"), "utf8")
  );
  if (expected.endBlock !== config.verifyEndBlock) {
    console.error(
      `expected.json covers blocks up to ${expected.endBlock} but the case verifies ` +
        `up to ${config.verifyEndBlock}. Regenerate it with scripts/generate-expected.ts.`
    );
    process.exit(1);
  }

  const head = await fetchChainHeight(apiToken);
  const headEndBlock = head - HEAD_OFFSET;

  console.log(`=== ${config.title} Benchmark ===`);
  console.log(
    `Verification range: ${config.startBlock.toLocaleString(
      "en-US"
    )}–${config.verifyEndBlock.toLocaleString("en-US")} · ` +
      `throughput window: ${windowS}s up to block ${headEndBlock.toLocaleString("en-US")}`
  );
  console.log(`Running: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];
  for (const name of selected) {
    const result = await benchmarkIndexer(
      name,
      config,
      expected,
      rpcUrl,
      apiToken,
      windowS,
      headEndBlock
    );
    results.push(result);

    console.log(
      `\nSummary — ${result.name}: ${formatRate(
        result.eventsPerSec
      )} events/s, ${formatRate(result.blocksPerSec)} blocks/s, ` +
        `data ${result.correctness}, db ${formatBytes(result.dbSizeBytes)}\n`
    );
    // Machine-readable line consumed by the CI summary job.
    console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`);
    await sleep(3_000);
  }

  console.log(`\n=== Results ===\n`);
  console.log(buildTable(results.map(toTableRow)));
}
