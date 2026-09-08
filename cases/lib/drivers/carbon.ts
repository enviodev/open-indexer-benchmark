import { type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { exec, kill, start, waitPg } from "../process.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 25_432;
export const CARBON_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/carbon`;

/**
 * Carbon reads Solana over plain RPC — its block crawler is the only Carbon 2
 * datasource that takes a bounded slot range — so this row needs an archive
 * endpoint deep enough to serve the scenario's slots. There is no shared one
 * to fall back to the way the EVM rows fall back to HyperRPC, which is why the
 * scenario runs this driver locally rather than in CI.
 */
export const carbonDriver: DriverFactory = ({ config, endBlock }) => {
  const dir = resolve(config.dir, "carbon");
  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    throw new Error(
      "SOLANA_RPC_URL must be set to an archive RPC endpoint that serves the " +
        "case's slot range — Carbon reads every block in it over RPC"
    );
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PORT: String(PG_PORT),
    DATABASE_URL: CARBON_DB_URL,
    SOLANA_RPC_URL: rpcUrl,
    START_SLOT: String(config.startBlock),
    END_SLOT: String(endBlock),
    RUST_LOG: process.env.RUST_LOG ?? "info",
  };

  let processor: ChildProcess | null = null;
  let done = false;

  // The row carries its own slot, so progress is read from the column rather
  // than parsed back out of the id.
  const readProgress = createProgressReader(CARBON_DB_URL, config, "slot");

  return {
    dbUrl: CARBON_DB_URL,
    async prepare() {
      console.log("Building the Carbon indexer...\n");
      // Release, and outside the measured window: a debug build would be
      // measuring rustc's choices rather than Carbon's.
      await exec("cargo", ["build", "--release"], dir, env);

      console.log("Starting PostgreSQL database...\n");
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
      await exec("docker", ["compose", "up", "-d"], dir, env);
      await waitPg(CARBON_DB_URL, "SELECT 1");
    },
    async launch() {
      // The binary creates its own table on startup, so there is no migration
      // step between the empty database and the first row.
      processor = start(
        "./target/release/carbon-solana-spl-transfers",
        [],
        dir,
        env
      );
      // The crawler stops when the slot range drains, and the process follows.
      processor.on("exit", () => (done = true));
    },
    async snapshot() {
      const { events, block } = await readProgress();
      return { events, blocks: blocksIndexed(config, block) };
    },
    async stop() {
      await kill(processor);
      processor = null;
    },
    async cleanup() {
      await exec("docker", ["compose", "down", "-v"], dir, env).catch(() => {});
    },
    exited: () => done,
  };
};
