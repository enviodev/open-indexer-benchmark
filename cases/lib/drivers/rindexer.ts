import { execFile, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { exec, kill, start, waitPg } from "../process.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 5440;
export const RINDEXER_DB_URL = `postgresql://postgres:rindexer@localhost:${PG_PORT}/postgres`;

// The first release with `networks[].hypersync` support. An older CLI ignores
// the unknown yaml key and quietly serves the run over plain RPC, which would
// publish an RPC measurement labeled HyperSync — so the hypersync row refuses
// to run on anything older rather than mislabel a result.
const HYPERSYNC_MIN_VERSION = [0, 43, 0] as const;

function versionAtLeast(version: string, min: readonly number[]): boolean {
  const parts = version.split(".").map((p) => parseInt(p, 10));
  for (let i = 0; i < min.length; i++) {
    const have = parts[i] ?? 0;
    if (have !== min[i]) return have > min[i];
  }
  return true;
}

export const rindexerDriver = (mode: "rpc" | "hypersync"): DriverFactory => ({
  config,
  rpcUrl,
  endBlock,
}) => {
  const dir = resolve(config.dir, "rindexer");
  const env = {
    ...process.env,
    ETHEREUM_RPC: rpcUrl,
    DATABASE_URL: RINDEXER_DB_URL,
    POSTGRES_PASSWORD: "rindexer",
    RINDEXER_END_BLOCK: String(endBlock),
    // One project directory serves both rows: rindexer.yaml substitutes these,
    // so the yaml stays the single place the configuration is written down.
    // The per-request range cap and the historic fetch fan-out exist to work
    // around eth_getLogs limits, so the hypersync row leaves both at
    // rindexer's defaults. rindexer picks the HyperSync API token up from
    // ENVIO_API_TOKEN on its own, which the benchmark already requires.
    RINDEXER_HYPERSYNC: mode === "hypersync" ? "true" : "false",
    RINDEXER_MAX_BLOCK_RANGE: mode === "hypersync" ? "50000" : "1000",
    RINDEXER_FETCH_CONCURRENCY: mode === "hypersync" ? "1" : "10",
  };
  const bin = resolve(
    process.env.HOME ?? "~",
    ".config",
    ".rindexer",
    "bin",
    "rindexer"
  );
  // A no-code project is driven entirely by rindexer.yaml and run through the
  // CLI. A rust project is a crate of its own: the aggregation lives in handler
  // code, so it is compiled ahead of the timer and the resulting binary is what
  // gets launched.
  const isRustProject = existsSync(resolve(dir, "Cargo.toml"));
  const rustBin = resolve(dir, "target", "release", "erc20indexer");
  let proc: ChildProcess | null = null;
  let done = false;

  // rindexer keeps its sync position in an internal schema whose layout is not
  // part of its public interface, but every event row carries the block it came
  // from, so progress is read from the event tables themselves.
  const readProgress = createProgressReader(RINDEXER_DB_URL, config, "block_number");

  return {
    dbUrl: RINDEXER_DB_URL,
    async prepare() {
      // A rust project runs its own binary, so the CLI is only needed to drive
      // a no-code one.
      if (!isRustProject && !existsSync(bin)) {
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

      if (mode === "hypersync" && !isRustProject) {
        const { stdout } = await promisify(execFile)(bin, ["--version"]);
        const version = stdout.trim().split(/\s+/).pop() ?? "";
        if (!versionAtLeast(version, HYPERSYNC_MIN_VERSION)) {
          throw new Error(
            `rindexer ${version} predates HyperSync support and would silently run ` +
              `over RPC; update to ${HYPERSYNC_MIN_VERSION.join(".")}+ ` +
              `(curl -L https://rindexer.xyz/install.sh | bash)`
          );
        }
      }

      if (isRustProject) {
        console.log("Building the rindexer rust project...\n");
        await exec("cargo", ["build", "--release"], dir, env);
      }

      console.log("Starting PostgreSQL via docker compose...");
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
      await exec("docker", ["compose", "up", "-d"], dir, env);
      await waitPg(RINDEXER_DB_URL, "SELECT 1");
    },
    async launch() {
      // Indexer only. The benchmark reads PostgreSQL directly, so serving a
      // GraphQL API alongside the indexing would be work no measurement uses —
      // and work the other indexers are not doing.
      proc = isRustProject
        ? start(rustBin, ["--indexer"], dir, env)
        : start(bin, ["start", "indexer"], dir, env);
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      const { events, block } = await readProgress();
      return { events, blocks: blocksIndexed(config, block) };
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
