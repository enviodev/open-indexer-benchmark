import { rmSync } from "node:fs";
import { exec } from "../../../cases/lib/process.ts";
import { Supervised, type DriverFactory } from "./common.ts";

/** Ponder insists on serving an HTTP API; this is where it is told to bind. */
const PORT = 19_891;

export const ponderDriver: DriverFactory = (ctx) => {
  const url = ctx.db.urlFor(ctx.database);
  const env = {
    ...process.env,
    PONDER_RPC_URL_1: ctx.rpcUrl,
    DATABASE_URL: url,
    PONDER_START_BLOCK: String(ctx.startBlock),
    ...(ctx.endBlock !== null ? { PONDER_END_BLOCK: String(ctx.endBlock) } : {}),
    PONDER_TELEMETRY_DISABLED: "true",
  };
  const proc = new Supervised("ponder");

  return {
    url,
    schemas: ["public"],
    async prepare() {
      rmSync(`${ctx.dir}/.ponder`, { recursive: true, force: true });
      await exec("pnpm", ["install", "--frozen-lockfile"], ctx.dir);
    },
    async launch() {
      // The production command, as the benchmark uses it. `--schema=public`
      // keeps the entity tables where introspection finds them, and matters
      // more here than there: Ponder namespaces a run by schema and recovers
      // its progress from the one it is given, so a restart that named a
      // different schema would silently start over instead of resuming.
      proc.start(
        "pnpm",
        ["ponder", "start", `--port=${PORT}`, "--schema=public"],
        ctx.dir,
        env
      );
    },
    stop: (signal) => proc.stop(signal),
    async cleanup() {
      await proc.stop("SIGKILL");
    },
    alive: () => proc.alive(),
    exit: () => proc.exit(),
    output: (lines) => proc.output(lines),
  };
};
