import { type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, start, waitPg } from "../process.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 23_798;
export const SQD_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/squid`;

/**
 * The Squid SDK reads chain data from either of two places, and the benchmark
 * measures both: the SQD Network gateway, or an RPC endpoint. `SQD_SOURCE`
 * tells the processor which to configure, and it configures only that one — a
 * processor holding both falls back to RPC near the head, so the network row
 * would be measuring a mixture. The RPC endpoint is dropped from the
 * environment of the network run rather than merely left unread, so a stray
 * RPC_ENDPOINT in the shell cannot put it back.
 */
export const sqdDriver = (source: "network" | "rpc"): DriverFactory => ({
  config,
  rpcUrl,
  endBlock,
}) => {
  const dir = resolve(config.dir, "sqd");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PORT: String(PG_PORT),
    DB_HOST: "localhost",
    DB_NAME: "squid",
    DB_PASS: "postgres",
    SQD_END_BLOCK: String(endBlock),
    SQD_SOURCE: source,
  };
  // A case whose handlers read contract state needs an RPC endpoint for those
  // reads whichever source the sync comes from, so the network run gets one
  // too. That is not the fallback this guards against: the mixture it prevents
  // is chain *data* arriving from two places, and a bounded run that stops well
  // short of the head never reaches the point where the processor would go to
  // RPC for it.
  if (source === "rpc" || config.ethCall) {
    env.RPC_ENDPOINT = rpcUrl;
  } else {
    delete env.RPC_ENDPOINT;
  }
  let processor: ChildProcess | null = null;
  let done = false;

  // Event ids are "<blockHeight>-<logIndex>", the only column on these entities
  // that carries the block. Taking the numeric maximum rather than the last id
  // in text order also drops the assumption that every height in a run has the
  // same number of digits.
  const readProgress = createProgressReader(
    SQD_DB_URL,
    config,
    "split_part(id, '-', 1)::bigint"
  );

  return {
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
      // Only the processor: progress and verification both read PostgreSQL, so
      // squid-graphql-server would be a second Node process competing for the
      // same machine without contributing to anything measured.
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
