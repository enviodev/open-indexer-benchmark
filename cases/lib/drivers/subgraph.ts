import { type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, psql, start, waitPg } from "../process.ts";
import { BENCHMARK_PORT, type DriverFactory } from "./common.ts";

const PG_PORT = 19_881;
const PG_CONTAINER = "subgraph-benchmark-pg";
export const SUBGRAPH_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/graphnode`;

/**
 * Graph Node release the `gnd` binary is taken from. Pinned rather than
 * resolved as "latest": `graph node install` looks the latest tag up through
 * the unauthenticated GitHub API and, when that call is throttled, installs
 * nothing and reports `release undefined does not exist` — the same failure
 * that used to drop rindexer from the table.
 */
const GRAPH_NODE_VERSION = "v0.44.0";

/** Ports gnd binds besides the shared GraphQL one. */
const INDEX_NODE_PORT = 19_882;
const ADMIN_PORT = 19_883;
const METRICS_PORT = 19_884;

export const subgraphDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "subgraph");
  const gnd = resolve(dir, "bin/gnd");
  let proc: ChildProcess | null = null;
  let done = false;
  /** Deployment schema (`sgd1`, …), resolved on the first successful snapshot. */
  let schema: string | null = null;

  return {
    name: "Graph Node",
    dbUrl: SUBGRAPH_DB_URL,
    async prepare() {
      console.log("Cleaning previous build...");
      rmSync(resolve(dir, "build"), { recursive: true, force: true });
      rmSync(resolve(dir, "generated"), { recursive: true, force: true });

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);

      // The manifest is the only place the block range can be expressed, and
      // graph-cli has no equivalent of an environment override, so the range
      // for this phase is baked in before codegen reads it.
      const template = readFileSync(resolve(dir, "subgraph.template.yaml"), "utf8");
      writeFileSync(
        resolve(dir, "subgraph.yaml"),
        template
          .replaceAll("__START_BLOCK__", String(config.startBlock))
          .replaceAll("__END_BLOCK__", String(endBlock))
      );

      if (!existsSync(gnd)) {
        console.log(`Installing Graph Node ${GRAPH_NODE_VERSION}...\n`);
        await exec(
          "pnpm",
          [
            "exec", "graph", "node", "install",
            "--tag", GRAPH_NODE_VERSION,
            "--bin-dir", resolve(dir, "bin"),
          ],
          dir
        );
      }

      console.log("Running codegen and build...\n");
      await exec("pnpm", ["exec", "graph", "codegen"], dir);
      await exec("pnpm", ["exec", "graph", "build"], dir);

      console.log("Starting PostgreSQL for Graph Node...");
      await exec("docker", ["rm", "-f", PG_CONTAINER], dir).catch(() => {});
      await exec(
        "docker",
        [
          "run", "-d", "--name", PG_CONTAINER,
          "-e", "POSTGRES_PASSWORD=postgres",
          "-e", "POSTGRES_DB=graphnode",
          // Graph Node refuses a database that is not UTF8/C — the default
          // locale of the postgres image is not.
          "-e", "POSTGRES_INITDB_ARGS=-E UTF8 --locale=C",
          "-p", `${PG_PORT}:5432`,
          "postgres:17-alpine",
        ],
        dir
      );
      await waitPg(SUBGRAPH_DB_URL, "SELECT 1");
    },
    async launch() {
      // `gnd dev` deploys the built subgraph itself and starts indexing on
      // startup, so launching the process is the start of the measured window —
      // there is no separate create/deploy step to keep out of it.
      proc = start(
        gnd,
        [
          "dev",
          "--postgres-url", SUBGRAPH_DB_URL,
          "--ethereum-rpc", `mainnet:${rpcUrl}`,
          "--http-port", String(BENCHMARK_PORT),
          "--index-node-port", String(INDEX_NODE_PORT),
          "--admin-port", String(ADMIN_PORT),
          "--metrics-port", String(METRICS_PORT),
        ],
        dir,
        {
          ...process.env,
          // gnd defaults to debug logging, which writes a line per trigger and
          // costs throughput no production deployment pays.
          GRAPH_LOG: "info",
        }
      );
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      if (!schema) {
        const found = await psql(
          SUBGRAPH_DB_URL,
          "SELECT name FROM public.deployment_schemas ORDER BY id DESC LIMIT 1"
        );
        if (!found.trim()) return null;
        schema = found.trim();
      }
      const counts = config.subgraphTables
        .map((table) => `(SELECT count(*) FROM ${schema}.${table})`)
        .join(" + ");
      // subgraphs.head is where Graph Node records the block each deployment
      // has reached; the entity tables hold the events written so far.
      const row = await psql(
        SUBGRAPH_DB_URL,
        `SELECT (SELECT coalesce(max(block_number), 0) FROM subgraphs.head) || '|' || (${counts})`
      );
      const [blockStr, eventStr] = row.trim().split("|");
      const block = Number(blockStr) || 0;
      return {
        events: Number(eventStr) || 0,
        blocks: block > config.startBlock ? block - config.startBlock : 0,
      };
    },
    async stop() {
      // gnd does not stop on SIGTERM; kill() escalates to SIGKILL on the
      // process group, which it does honour. This runs after the timer.
      await kill(proc);
      proc = null;
    },
    async cleanup() {
      await exec("docker", ["rm", "-f", PG_CONTAINER], dir).catch(() => {});
    },
    // Reaching the manifest's endBlock stops the deployment but leaves the
    // process running, so completion is decided by the runner's progress
    // targets rather than here.
    exited: () => done,
  };
};
