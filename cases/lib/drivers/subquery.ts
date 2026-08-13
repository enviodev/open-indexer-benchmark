import { type ChildProcess } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, psql, start, waitPg } from "../process.ts";
import { containerUrl } from "../container.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 5432;
export const SUBQUERY_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`;

/** Matches `--db-schema` in each case's docker-compose.yml. */
const DB_SCHEMA = "app";

export const subqueryDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
  const dir = resolve(config.dir, "subquery");
  const env = {
    ...process.env,
    // This is the one indexer that runs inside a container, so a case serving
    // its own contract calls from the host has to be addressed as the host.
    ETHEREUM_RPC_URL: containerUrl(rpcUrl),
    SUBQUERY_END_BLOCK: String(endBlock),
  };
  let proc: ChildProcess | null = null;
  let done = false;

  const readEvents = createProgressReader(SUBQUERY_DB_URL, config);

  return {
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

      writeFileSync(
        resolve(dir, ".env"),
        `ETHEREUM_RPC_URL=${env.ETHEREUM_RPC_URL}\n`
      );

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
      // `_metadata` is the same key/value table the GraphQL `_metadata` field
      // is served from, so the height read here is the node's own sync
      // position — it keeps advancing through ranges that produced no events.
      // The value column is jsonb, whose text rendering of a JSON string keeps
      // its quotes; stripping them also makes this work unchanged if SubQuery
      // ever stores the column as plain text.
      const [{ events }, height] = await Promise.all([
        readEvents(),
        psql(
          SUBQUERY_DB_URL,
          `SELECT trim(both '"' from value::text) FROM "${DB_SCHEMA}"._metadata ` +
            `WHERE key = 'lastProcessedHeight'`
        ),
      ]);
      return {
        events,
        blocks: blocksIndexed(config, parseInt(height, 10) || 0),
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
