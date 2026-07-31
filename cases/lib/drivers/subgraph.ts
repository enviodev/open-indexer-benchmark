import { type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, psql, start, waitPg } from "../process.ts";
import {
  BENCHMARK_PORT,
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

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

  const readEvents = createProgressReader(SUBGRAPH_DB_URL, config);

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

      // The tag installed is recorded beside the binary, because the binary
      // cannot be asked: `gnd --version` reports a commit hash, not the release
      // it came from. Taking its presence as proof of its version would mean a
      // developer who ran an earlier revision keeps benchmarking the Graph Node
      // they already had after a version bump — bin/ is gitignored and nothing
      // else ever clears it. CI is covered by the cache key, which changes with
      // this file, but only incidentally, and only in CI.
      const binDir = resolve(dir, "bin");
      const versionFile = resolve(binDir, ".gnd-version");
      const installed =
        existsSync(gnd) && existsSync(versionFile)
          ? readFileSync(versionFile, "utf8").trim()
          : null;

      if (installed !== GRAPH_NODE_VERSION) {
        console.log(`Installing Graph Node ${GRAPH_NODE_VERSION}...\n`);
        // `graph node install` renames the downloaded binary into --bin-dir
        // without creating it first, and fails with ENOENT if it is missing —
        // which it is on any run the cache did not restore.
        mkdirSync(binDir, { recursive: true });
        await exec(
          "pnpm",
          [
            "exec", "graph", "node", "install",
            "--tag", GRAPH_NODE_VERSION,
            "--bin-dir", binDir,
          ],
          dir
        );
        // Written only after a successful install, so an interrupted one is
        // retried rather than recorded as done.
        writeFileSync(versionFile, `${GRAPH_NODE_VERSION}\n`);
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
      // `subgraphs.head` is Graph Node's own record of where each deployment
      // has got to — the same position its index-node status API serves. It
      // keeps advancing through ranges that produced no events, which matters
      // for a sparse contract where most scanned blocks write nothing.
      const [{ events }, block] = await Promise.all([
        readEvents(),
        psql(
          SUBGRAPH_DB_URL,
          "SELECT coalesce(max(block_number), 0) FROM subgraphs.head"
        ),
      ]);
      return {
        events,
        blocks: blocksIndexed(config, parseInt(block, 10) || 0),
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
