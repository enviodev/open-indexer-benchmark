import { type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { exec, kill, psql, start } from "../process.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
} from "./common.ts";

const PG_PORT = 5433;
export const ENVIO_DB_URL = `postgresql://postgres:testing@localhost:${PG_PORT}/envio-dev`;

export const envioDriver = (mode: "hypersync" | "rpc"): DriverFactory => ({
  config,
  rpcUrl,
  endBlock,
}) => {
  const dir = resolve(config.dir, "envio");
  const env = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_HASURA: "false",
    ENVIO_PG_PORT: String(PG_PORT),
    ENVIO_RPC_URL: rpcUrl,
    ENVIO_RPC_FOR: mode === "rpc" ? "sync" : "fallback",
    ENVIO_END_BLOCK: String(endBlock),
  };
  let proc: ChildProcess | null = null;
  let done = false;

  const readEvents = createProgressReader(ENVIO_DB_URL, config);

  return {
    dbUrl: ENVIO_DB_URL,
    async prepare() {
      console.log("Cleaning envio cache...");
      rmSync(resolve(dir, ".envio"), { recursive: true, force: true });

      // Envio is the only driver that reuses one database across phases, and
      // `envio start -r` resets it asynchronously after launch. A snapshot taken
      // before that reset lands reads the previous phase's progress — and when
      // the previous phase reached its end block, that stale reading satisfies
      // the completion check immediately and yields an absurd rate. Drop the
      // schema up front so no prior state can be observed at all.
      await psql(ENVIO_DB_URL, "DROP SCHEMA IF EXISTS public CASCADE").catch(
        () => {}
      );
      await psql(ENVIO_DB_URL, "CREATE SCHEMA public").catch(() => {});

      console.log("Installing dependencies...\n");
      await exec("pnpm", ["install", "--frozen-lockfile"], dir);
      await exec("pnpm", ["envio", "codegen"], dir, env);
    },
    async launch() {
      // `-r` resets the database, so each phase starts from a clean state.
      proc = start("pnpm", ["envio", "start", "-r"], dir, env);
      proc.on("exit", () => (done = true));
    },
    async snapshot() {
      // Envio's own progress row is the better reading — it advances through
      // ranges that produced no events — but it is written on a throttle, and
      // a batch's entity rows land before it. On a short run that gap is the
      // whole measurement: a range indexed in sixteen seconds has been seen to
      // finish, commit all 19,125 rows, and exit with the progress row still
      // reading zero. So the event tables are counted too, and the higher of
      // the two counts wins. Both are committed work either way.
      const [row, rows] = await Promise.all([
        psql(
          ENVIO_DB_URL,
          "SELECT events_processed, progress_block FROM public.envio_chains LIMIT 1"
        ),
        readEvents().catch(() => ({ events: 0 })),
      ]);
      const [eventsStr, blockStr] = row.split("|");
      return {
        events: Math.max(parseInt(eventsStr, 10) || 0, rows.events),
        blocks: blocksIndexed(config, parseInt(blockStr, 10) || 0),
      };
    },
    async stop() {
      await kill(proc);
      proc = null;
    },
    // Deliberately empty: envio manages its own Postgres container, and the
    // next phase drops the schema in prepare() anyway. Leaving it up costs a
    // throwaway CI runner nothing and saves a container restart per phase; run
    // `envio stop` in the case directory to reclaim it locally.
    async cleanup() {},
    exited: () => done,
  };
};
