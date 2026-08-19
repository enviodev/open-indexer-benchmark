import { type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseConfig } from "../case.ts";
import { exec, kill, psql, start } from "../process.ts";
import {
  blocksIndexed,
  createProgressReader,
  type DriverFactory,
  type Snapshot,
} from "./common.ts";

const PG_PORT = 5433;
export const ENVIO_DB_URL = `postgresql://postgres:testing@localhost:${PG_PORT}/envio-dev`;

/**
 * Reads how far a HyperIndex process has got. Both Envio Indexer and Envio
 * Subgraph write the same `envio_chains` row, on the same throttle, so they
 * share this rather than each inventing a way to lose the race.
 *
 * The progress row is the better reading — it advances through ranges that
 * produced no events — but it is written on a throttle, and a batch's entity
 * rows land before it. On a short run that gap is the whole measurement: a
 * range indexed in sixteen seconds has been seen to finish, commit all 19,125
 * rows, and exit with the progress row still reading zero. So the event tables
 * are counted too, and the higher of the two counts wins. Both are committed
 * work either way.
 *
 * Both readings only ever move forwards, so a later one that comes back lower
 * is the read racing the writer rather than work being undone — and the final
 * reading is the one that decides the rate. Without a high-water mark a run
 * could publish a real events/s beside a blocks/s of zero, since the event
 * count has a second source to fall back on and the block position does not.
 */
export function createEnvioSnapshot(config: CaseConfig): () => Promise<Snapshot> {
  // Furthest this phase has been seen to get. A driver is built per phase, so
  // this starts empty for each one and never carries a previous phase's work.
  let highWater: Snapshot = { events: 0, blocks: 0 };
  const readEvents = createProgressReader(ENVIO_DB_URL, config);

  return async () => {
    const [row, rows] = await Promise.all([
      psql(
        ENVIO_DB_URL,
        "SELECT events_processed, progress_block FROM public.envio_chains LIMIT 1"
      ),
      readEvents().catch(() => ({ events: 0 })),
    ]);
    const [eventsStr, blockStr] = row.split("|");
    highWater = {
      events: Math.max(highWater.events, parseInt(eventsStr, 10) || 0, rows.events),
      blocks: Math.max(
        highWater.blocks,
        blocksIndexed(config, parseInt(blockStr, 10) || 0)
      ),
    };
    return highWater;
  };
}

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

  return {
    dbUrl: ENVIO_DB_URL,
    async prepare() {
      console.log("Cleaning envio cache...");
      rmSync(resolve(dir, ".envio"), { recursive: true, force: true });

      // Both Envio drivers reuse one database across phases, and
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
    snapshot: createEnvioSnapshot(config),
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
