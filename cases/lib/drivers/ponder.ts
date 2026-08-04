import { type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, psql, start, waitPg } from "../process.ts";
import {
  BENCHMARK_PORT,
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 19_877;
const PG_CONTAINER = "ponder-benchmark-pg";
export const PONDER_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/ponder`;

export const ponderDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "ponder");
  const env = {
    ...process.env,
    PONDER_RPC_URL_1: rpcUrl,
    DATABASE_URL: PONDER_DB_URL,
    PONDER_END_BLOCK: String(endBlock),
  };
  let proc: ChildProcess | null = null;
  let done = false;

  const readEvents = createProgressReader(PONDER_DB_URL, config);

  return {
    dbUrl: PONDER_DB_URL,
    async prepare() {
      console.log("Cleaning .ponder cache...");
      rmSync(resolve(dir, ".ponder"), { recursive: true, force: true });

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);

      console.log("Starting PostgreSQL for Ponder...");
      await exec("docker", ["rm", "-f", PG_CONTAINER], dir).catch(() => {});
      await exec(
        "docker",
        [
          "run", "-d", "--name", PG_CONTAINER,
          "-e", "POSTGRES_PASSWORD=postgres",
          "-e", "POSTGRES_DB=ponder",
          "-p", `${PG_PORT}:5432`,
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
      const [{ events }, checkpoint] = await Promise.all([
        readEvents(),
        psql(
          PONDER_DB_URL,
          'SELECT "latest_checkpoint" FROM _ponder_checkpoint LIMIT 1'
        ).catch(() => ""),
      ]);
      // Checkpoint is a 75-char string: [10 timestamp][16 chainId][16 blockNumber]…
      const block =
        checkpoint.length >= 42 ? Number(BigInt(checkpoint.slice(26, 42))) : 0;
      return { events, blocks: blocksIndexed(config, block) };
    },
    async stop() {
      await kill(proc);
      proc = null;
    },
    async cleanup() {
      await exec("docker", ["rm", "-f", PG_CONTAINER], dir).catch(() => {});
    },
    exited: () => done,
  };
};
