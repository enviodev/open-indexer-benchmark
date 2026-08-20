import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "../../../cases/lib/process.ts";
import { Supervised, type DriverFactory } from "./common.ts";

/** Matches `--db-schema` in the project's docker-compose.yml. */
const DB_SCHEMA = "app";

export const subqueryDriver: DriverFactory = (ctx) => {
  const url = ctx.db.urlFor(ctx.database);
  // SubQuery's node runs in a container, so it reaches both the mock endpoint
  // and the shared database through the host gateway the compose file maps in.
  const env = {
    ...process.env,
    ETHEREUM_RPC_URL: ctx.rpcContainerUrl,
    SUBQUERY_START_BLOCK: String(ctx.startBlock),
    SUBQUERY_END_BLOCK: ctx.endBlock === null ? "" : String(ctx.endBlock),
    DB_HOST: "host.docker.internal",
    DB_PORT: String(ctx.db.port),
    DB_USER: "postgres",
    DB_PASS: "reliability",
    DB_DATABASE: ctx.database,
  };
  const proc = new Supervised("subquery");

  return {
    url,
    schemas: [DB_SCHEMA],
    async prepare() {
      for (const path of [".data", "dist", "src/types"]) {
        rmSync(resolve(ctx.dir, path), { recursive: true, force: true });
      }
      await exec("pnpm", ["install", "--frozen-lockfile"], ctx.dir);
      // project.ts reads the endpoint and range from the environment and bakes
      // them into project.yaml, so both steps need the same environment.
      await exec("pnpm", ["codegen"], ctx.dir, env);
      await exec("pnpm", ["build"], ctx.dir, env);
      writeFileSync(resolve(ctx.dir, ".env"), `ETHEREUM_RPC_URL=${ctx.rpcContainerUrl}\n`);

      await exec("docker", ["compose", "down", "-v"], ctx.dir, env).catch(() => {});
      await exec("docker", ["compose", "pull"], ctx.dir, env);
    },
    async launch() {
      // `--abort-on-container-exit` is what makes a crash visible: without it
      // Compose keeps running after the node dies and the harness would record
      // a tool that stopped indexing as one that merely got slow.
      proc.start(
        "docker",
        ["compose", "up", "--remove-orphans", "--abort-on-container-exit"],
        ctx.dir,
        env
      );
    },
    async stop(signal) {
      await proc.stop(signal);
      // Killing the foreground `compose up` leaves the container behind, and a
      // relaunch would then attach to a node that never stopped indexing.
      await exec("docker", ["compose", "kill"], ctx.dir, env).catch(() => {});
      await exec("docker", ["compose", "rm", "-f"], ctx.dir, env).catch(() => {});
    },
    async cleanup() {
      await proc.stop("SIGKILL");
      await exec("docker", ["compose", "down", "-v"], ctx.dir, env).catch(() => {});
    },
    alive: () => proc.alive(),
    exit: () => proc.exit(),
    output: (lines) => proc.output(lines),
  };
};
