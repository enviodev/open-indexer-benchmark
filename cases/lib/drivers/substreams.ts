import { type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, psql, start, waitPg } from "../process.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 25_433;
// `postgres://` rather than `postgresql://`: substreams-sink-sql accepts only
// psql, postgres, clickhouse and parquet as schemes, and node-postgres is happy
// with either, so one URL serves both.
export const SUBSTREAMS_DB_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/substreams?sslmode=disable`;

/** Where `prepare` puts the two binaries it fetches. */
const BIN = ".bin";

/**
 * Substreams reads Solana through StreamingFast, which bills by the request
 * and needs an API key, so there is no shared endpoint the way HyperRPC serves
 * the EVM rows. Like Carbon, this row is measured by hand rather than on every
 * push, and the scenario lists it under `localOnly`.
 */
export const substreamsDriver: DriverFactory = ({ config, endBlock }) => {
  const dir = resolve(config.dir, "substreams");
  const apiKey = process.env.SUBSTREAMS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SUBSTREAMS_API_KEY must be set to a StreamingFast key — the CLI " +
        "exchanges it for a JWT and Substreams serves nothing without one"
    );
  }
  const endpoint =
    process.env.SUBSTREAMS_ENDPOINT ?? "mainnet.sol.streamingfast.io:443";

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUBSTREAMS_API_KEY: apiKey,
    DB_PORT: String(PG_PORT),
    DATABASE_URL: SUBSTREAMS_DB_URL,
  };

  let sink: ChildProcess | null = null;
  let done = false;
  /** Only tear down a database this driver brought up. */
  let startedContainer = false;

  // The row carries its own slot, so progress is read from the column rather
  // than parsed back out of the id — which here is a signature, and says
  // nothing about position.
  const readProgress = createProgressReader(SUBSTREAMS_DB_URL, config, "slot");

  const sinkBin = resolve(dir, BIN, "substreams-sink-sql");

  return {
    dbUrl: SUBSTREAMS_DB_URL,
    async prepare() {
      if (!existsSync(sinkBin)) {
        console.log("Fetching the Substreams toolchain...\n");
        await exec("bash", ["./fetch-tools.sh"], dir, env);
      }

      console.log("Building the Substreams module...\n");
      // Release, and outside the measured window: the wasm is what the server
      // runs, so a debug build would measure rustc rather than Substreams.
      await exec(
        "cargo",
        ["build", "--target", "wasm32-unknown-unknown", "--release"],
        dir,
        env
      );

      // Measured by hand, so a Postgres already listening on the port is taken
      // as one someone put there on purpose — a machine without a Docker
      // daemon can still run the scenario. The sink keeps its own bookkeeping
      // beside the rows, so the whole schema goes rather than one table.
      const existing = await waitPg(SUBSTREAMS_DB_URL, "SELECT 1", 2_000).then(
        () => true,
        () => false
      );
      if (existing) {
        console.log("Using the PostgreSQL already listening on this port...\n");
        await psql(SUBSTREAMS_DB_URL, "DROP SCHEMA IF EXISTS public CASCADE");
        await psql(SUBSTREAMS_DB_URL, "CREATE SCHEMA public");
      } else {
        console.log("Starting PostgreSQL database...\n");
        await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
        await exec("docker", ["compose", "up", "-d"], dir, env);
        await waitPg(SUBSTREAMS_DB_URL, "SELECT 1");
      }
      startedContainer = !existing;

      // `setup` applies schema.sql and creates the sink's cursor table. It is
      // a migration step, so it runs before the clock starts.
      await exec(sinkBin, ["setup", SUBSTREAMS_DB_URL, "./substreams.yaml"], dir, env);
    },
    async launch() {
      sink = start(
        sinkBin,
        [
          "run",
          SUBSTREAMS_DB_URL,
          "./substreams.yaml",
          `${config.startBlock}:${endBlock + 1}`,
          "-e",
          endpoint,
          // The scenario's range is final, so there is no reorg to unwind and
          // nothing to hold back from the table.
          "--undo-buffer-size",
          "0",
          "--final-blocks-only",
          // The sink batches 1,000 blocks by default and drops whatever is
          // pending when it reaches a stop block, so a bounded run loses its
          // tail: over this scenario's range that was 29,723 of 119,152
          // transfers, and over a 100-block range it wrote 25 rows of 2,914.
          // Flushing every block is what makes a bounded run complete, and it
          // is the write pattern this row therefore measures.
          "--batch-block-flush-interval",
          "1",
        ],
        dir,
        env
      );
      // The sink stops when the range drains, and the process follows.
      sink.on("exit", () => (done = true));
    },
    async snapshot() {
      const { events, block } = await readProgress();
      return { events, blocks: blocksIndexed(config, block) };
    },
    async stop() {
      await kill(sink);
      sink = null;
    },
    async cleanup() {
      if (!startedContainer) return;
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
    },
    exited: () => done,
  };
};
