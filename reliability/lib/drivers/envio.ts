import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { exec } from "../../../cases/lib/process.ts";
import { Supervised, type DriverFactory } from "./common.ts";

/**
 * Envio reads the chain through HyperSync by default. Reliability scenarios run
 * against the mock endpoint, so RPC is made the sync source rather than the
 * fallback: what is under test is the indexer's write path, reorg unwinding and
 * restart recovery, all of which are the same code either way.
 */
export const envioDriver: DriverFactory = (ctx) => {
  const url = ctx.db.urlFor(ctx.database);
  const env = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_HASURA: "false",
    ENVIO_PG_HOST: "127.0.0.1",
    ENVIO_PG_PORT: String(ctx.db.port),
    ENVIO_PG_USER: "postgres",
    ENVIO_PG_PASSWORD: "reliability",
    ENVIO_PG_DATABASE: ctx.database,
    ENVIO_RPC_URL: ctx.rpcUrl,
    ENVIO_RPC_FOR: "sync",
  };
  const proc = new Supervised("envio");

  return {
    url,
    schemas: ["public"],
    async prepare() {
      rmSync(resolve(ctx.dir, ".envio"), { recursive: true, force: true });
      rmSync(resolve(ctx.dir, "generated"), { recursive: true, force: true });

      // The block range lives in the manifest, and a scenario that follows the
      // head has no end block at all — an unset `${ENVIO_END_BLOCK}` would be
      // substituted as an empty string and rejected. So the manifest is written
      // per run from a template, the way the subgraph one is.
      const template = readFileSync(resolve(ctx.dir, "config.template.yaml"), "utf8");
      writeFileSync(
        resolve(ctx.dir, "config.yaml"),
        template
          .replaceAll("__START_BLOCK__", String(ctx.startBlock))
          .replaceAll(
            "__END_BLOCK_LINE__",
            ctx.endBlock === null ? "" : `end_block: ${ctx.endBlock}`
          )
      );

      await exec("pnpm", ["install", "--frozen-lockfile"], ctx.dir);
      await exec("pnpm", ["envio", "codegen"], ctx.dir, env);
    },
    async launch() {
      // No `-r`: that resets the database, and every launch after the first is
      // a recovery from a crash the harness caused.
      proc.start("pnpm", ["envio", "start"], ctx.dir, env);
    },
    stop: (signal) => proc.stop(signal),
    async cleanup() {
      await proc.stop("SIGKILL");
    },
    alive: () => proc.alive(),
    exit: () => proc.exit(),
    output: () => proc.output(),
  };
};
