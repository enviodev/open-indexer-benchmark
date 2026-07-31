import { type ChildProcess } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec, gql, kill, start, waitPg } from "../process.ts";
import { BENCHMARK_PORT, type DriverFactory } from "./common.ts";

const PG_PORT = 5432;
export const SUBQUERY_DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/postgres`;

export const subqueryDriver: DriverFactory = ({ config, rpcUrl, endBlock }) => {
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
