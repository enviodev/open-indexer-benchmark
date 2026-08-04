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

export const sqdDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "sqd");
  const env = {
    ...process.env,
    RPC_ENDPOINT: rpcUrl,
    DB_PORT: String(PG_PORT),
    DB_HOST: "localhost",
    DB_NAME: "squid",
    DB_PASS: "postgres",
    SQD_END_BLOCK: String(endBlock),
  };
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
