import { type ChildProcess } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseConfig } from "../case.ts";
import { clickhouse, waitClickHouse, type ClickHouseConnection } from "../clickhouse.ts";
import { exec, kill, psql, start, signalGroup } from "../process.ts";
import { resolveEntityTables, type EntityTable } from "../verify.ts";
import {
  blocksIndexed,
  createProgressReader,
  instanceName,
  port,
  type DriverFactory,
  type EntityStore,
  type Snapshot,
} from "./common.ts";

const PG_PORT = port(5433);

/**
 * The ClickHouse the `clickhouse` variant keeps its entities in. The image is
 * the one `envio dev` runs, so the row measures the server HyperIndex ships
 * with rather than whichever one happened to be newest.
 */
export const CLICKHOUSE_IMAGE = "clickhouse/clickhouse-server:26.2.15.4";
const CLICKHOUSE_PORT = port(18_123);
const CLICKHOUSE_CONTAINER = instanceName("envio-benchmark-clickhouse");
const CLICKHOUSE: ClickHouseConnection = {
  url: `http://localhost:${CLICKHOUSE_PORT}`,
  username: "default",
  password: "testing",
  database: "envio",
};

/**
 * The config the `clickhouse` variant starts from: the project's own, with
 * every entity moved to ClickHouse. Generated rather than committed, so the
 * two rows can never be indexing different projects.
 */
const CLICKHOUSE_CONFIG = "config.clickhouse.yaml";

/**
 * The HTTP server HyperIndex always starts, for its metrics and health check.
 * 9898 unless told otherwise, and told here only so two copies can run side by
 * side; nothing reads it.
 */
export const ENVIO_INDEXER_PORT = port(9898);

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
export function createEnvioSnapshot(
  config: CaseConfig,
  readEvents: () => Promise<{ events: number }> = createProgressReader(ENVIO_DB_URL, config)
): () => Promise<Snapshot> {
  // Furthest this phase has been seen to get. A driver is built per phase, so
  // this starts empty for each one and never carries a previous phase's work.
  let highWater: Snapshot = { events: 0, blocks: 0, rows: 0 };

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
      // Reported apart from `events`, which is the higher of the progress row
      // and this count: `events_processed` reaches the end of the range before
      // the last batch is committed, and a phase that stopped there would be
      // verified against a table still being written to.
      rows: Math.max(highWater.rows ?? 0, rows.events),
    };
    return highWater;
  };
}

/**
 * Counts the committed rows of the event entities HyperIndex keeps in
 * ClickHouse.
 *
 * Each entity there is a view that picks the latest committed version of every
 * id out of its change history, `envio_history_<Entity>`. Counting the view
 * sorts the whole history on every poll — most of a second of CPU at a few
 * million rows, taken from the indexer it is measuring. Event entities are
 * written once per id, so the history's committed SET rows are the same count,
 * read off two narrow columns in milliseconds. The checkpoint bound is the
 * view's own: rows of a batch that has not committed yet are not counted.
 */
function createClickHouseRowReader(
  store: EntityStore,
  config: CaseConfig
): () => Promise<{ events: number }> {
  const specs = config.entities.filter((e) => config.eventEntities.includes(e.key));
  let tables: EntityTable[] | null = null;
  return async () => {
    try {
      tables ??= await resolveEntityTables(store.sql, specs, "clickhouse");
      const counts = tables
        .map(
          (t) =>
            `(SELECT count() FROM "${t.schema}"."envio_history_${t.table}" ` +
            `WHERE envio_change = 'SET' AND envio_checkpoint_id <= ` +
            `(SELECT max(checkpoint_id) FROM "${t.schema}".envio_chains FINAL))`
        )
        .join(" + ");
      return { events: parseInt(await store.sql(`SELECT toString(${counts})`), 10) || 0 };
    } catch (err) {
      tables = null;
      throw err;
    }
  };
}

/**
 * Envio Indexer, reading from HyperSync or from a plain RPC endpoint, and
 * keeping its entities in PostgreSQL or — with `storage: "clickhouse"` — in
 * ClickHouse.
 *
 * PostgreSQL is there either way: HyperIndex keeps its own progress in it, so
 * the snapshot reads the same row for both, and only the entities move.
 */
export const envioDriver = (
  mode: "hypersync" | "rpc",
  storage: "postgres" | "clickhouse" = "postgres"
): DriverFactory => ({ config, rpcUrl, endBlock, wsUrl }) => {
  const dir = resolve(config.dir, "envio");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ENVIO_TUI: "false",
    ENVIO_HASURA: "false",
    ENVIO_PG_PORT: String(PG_PORT),
    ENVIO_INDEXER_PORT: String(ENVIO_INDEXER_PORT),
    ENVIO_RPC_URL: rpcUrl,
    ENVIO_RPC_FOR: mode === "rpc" ? "sync" : "fallback",
    ENVIO_END_BLOCK: String(endBlock),
  };
  // A WebSocket for new-block notifications lives in a config of its own:
  // `ws` has to be absent rather than empty when there is none, and the
  // config's variable substitution cannot express "absent".
  if (wsUrl) {
    env.ENVIO_CONFIG = "config.ws.yaml";
    env.ENVIO_RPC_WS = wsUrl;
  }
  const baseConfig = env.ENVIO_CONFIG ?? "config.yaml";
  let store: EntityStore | undefined;
  if (storage === "clickhouse") {
    env.ENVIO_CONFIG = CLICKHOUSE_CONFIG;
    env.ENVIO_CLICKHOUSE_HOST = CLICKHOUSE.url;
    env.ENVIO_CLICKHOUSE_USERNAME = CLICKHOUSE.username;
    env.ENVIO_CLICKHOUSE_PASSWORD = CLICKHOUSE.password;
    env.ENVIO_CLICKHOUSE_DATABASE = CLICKHOUSE.database;
    store = { dialect: "clickhouse", sql: (query) => clickhouse(CLICKHOUSE, query) };
  }
  let proc: ChildProcess | null = null;
  let done = false;
  /** Not launched yet, so the next launch starts from an empty database. */
  let fresh = true;

  return {
    dbUrl: ENVIO_DB_URL,
    store,
    async prepare() {
      console.log("Cleaning envio cache...");
      rmSync(resolve(dir, ".envio"), { recursive: true, force: true });

      if (storage === "clickhouse") {
        const base = readFileSync(resolve(dir, baseConfig), "utf8");
        if (/^storage:/m.test(base)) {
          throw new Error(`${baseConfig} already sets storage, so it cannot be moved to ClickHouse`);
        }
        writeFileSync(
          resolve(dir, CLICKHOUSE_CONFIG),
          `${base.trimEnd()}\nstorage:\n  clickhouse:\n    default: true\n`
        );

        // A fresh server per phase, the way the PostgreSQL schema is dropped
        // below: nothing a previous phase wrote can be read as this one's work.
        console.log("Starting ClickHouse...");
        await exec("docker", ["rm", "-fv", CLICKHOUSE_CONTAINER], dir).catch(() => {});
        await exec(
          "docker",
          [
            "run", "-d", "--name", CLICKHOUSE_CONTAINER,
            "-e", `CLICKHOUSE_USER=${CLICKHOUSE.username}`,
            "-e", `CLICKHOUSE_PASSWORD=${CLICKHOUSE.password}`,
            "-e", `CLICKHOUSE_DB=${CLICKHOUSE.database}`,
            "-p", `${CLICKHOUSE_PORT}:8123`,
            CLICKHOUSE_IMAGE,
          ],
          dir
        );
        await waitClickHouse(CLICKHOUSE);
      }

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
      // `-r` resets the database, so each phase starts from a clean state -
      // on the first launch only. A relaunch is a restart of the same run,
      // and resetting there would hand the reliability suite a tool that
      // re-indexes from scratch after every crash and so never has anything
      // to recover.
      proc = start("pnpm", ["envio", "start", ...(fresh ? ["-r"] : [])], dir, env);
      fresh = false;
      // A relaunch starts alive, and only this process's exit counts: one
      // killed just before it can report its exit after this one started.
      done = false;
      const current = proc;
      current.on("exit", () => {
        if (proc === current || proc === null) done = true;
      });
    },
    snapshot: createEnvioSnapshot(
      config,
      store ? createClickHouseRowReader(store, config) : undefined
    ),
    async stop() {
      await kill(proc);
      proc = null;
    },
    // Envio's own Postgres is deliberately left up: the next phase drops the
    // schema in prepare() anyway, and leaving it costs a throwaway CI runner
    // nothing while saving a container restart per phase. ClickHouse is the
    // driver's own container, and the next phase starts a fresh one.
    async cleanup() {
      if (storage === "clickhouse") {
        await exec("docker", ["rm", "-fv", CLICKHOUSE_CONTAINER], dir).catch(() => {});
      }
    },
    signal: (signal) => signalGroup(proc, signal),
    exited: () => done,
  };
};
