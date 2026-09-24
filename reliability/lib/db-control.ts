// Taking an indexer's database away from it, and giving it back.
//
// Every driver starts its own Postgres, and no two do it the same way: two run
// a container directly, three bring one up through docker compose, and one
// lets the tool start its own. Asking each driver to expose a handle would mean
// seven more methods on an interface the throughput suite shares, all of them
// for one scenario.
//
// They do agree on one thing, because the harness could not read their tables
// otherwise: the database answers on a known port of the host. So that is what
// is used - find whatever publishes that port and stop it. It works for a bare
// container, for a compose service and for a database the tool started itself,
// and it keeps the knowledge in the scenario that needs it.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { psql, sleep, waitPg } from "../../cases/lib/process.ts";

const run = promisify(execFile);

export class NoDatabaseContainer extends Error {}

/** The port a `postgresql://…:5433/db` URL answers on. */
function portOf(dbUrl: string): string {
  const port = new URL(dbUrl).port;
  if (!port) throw new NoDatabaseContainer(`no port in database URL ${dbUrl}`);
  return port;
}

/**
 * The container publishing the tool's database port.
 *
 * Refuses to guess when more than one matches. Stopping the wrong container
 * would leave the scenario looking like a tool that survived a restart it was
 * never given, which is worse than a scenario that could not run.
 */
async function containerFor(dbUrl: string): Promise<string> {
  const port = portOf(dbUrl);
  const { stdout } = await run("docker", [
    "ps",
    "--filter",
    `publish=${port}`,
    "--format",
    "{{.ID}} {{.Names}}",
  ]);
  const matches = stdout.trim().split("\n").filter(Boolean);
  if (matches.length === 0) {
    throw new NoDatabaseContainer(
      `no running container publishes port ${port}, so the database cannot be restarted`
    );
  }
  if (matches.length > 1) {
    throw new NoDatabaseContainer(
      `${matches.length} containers publish port ${port} (${matches.join(", ")}); ` +
        `refusing to guess which one is the indexer's database`
    );
  }
  return matches[0].split(" ")[0];
}

export interface RestartOutcome {
  /** Milliseconds the database was unreachable, as the harness saw it. */
  downMs: number;
  /** The container that was stopped, for the log. */
  container: string;
}

/**
 * Stop the tool's database, hold it down, and bring it back.
 *
 * `docker stop` sends SIGTERM and Postgres shuts down cleanly, which is the
 * kinder version of this failure and the one worth testing first: a tool that
 * cannot survive a graceful restart has no chance at a crash. The connections
 * it held are closed under it either way, which is the part that matters.
 */
export async function restartDatabase(
  dbUrl: string,
  downMs: number
): Promise<RestartOutcome> {
  const container = await containerFor(dbUrl);
  const startedAt = performance.now();
  await run("docker", ["stop", container]);
  await sleep(downMs);
  await run("docker", ["start", container]);
  // Postgres accepting connections is not the same as docker reporting the
  // container started, and the scenario times a tool's recovery from the
  // moment the database was really there.
  await waitPg(dbUrl, "SELECT 1", 60_000);
  return { downMs: performance.now() - startedAt, container };
}

/**
 * Freeze the tool's database, hold it frozen, and thaw it.
 *
 * `docker pause` is SIGSTOP: the container's processes stop running and its
 * sockets stay open. Every connection the tool holds is still established and
 * nothing it sends is ever answered, which is a different failure from the
 * one `restartDatabase` stages - there, connections are closed and a query
 * fails immediately with an error a driver can see. Here there is no error at
 * all, only silence, and a tool without a statement timeout waits in it
 * forever. That is the outage that pages people: the process is up, its
 * health check answers, and it has not written a row in an hour.
 */
export async function pauseDatabase(
  dbUrl: string,
  downMs: number
): Promise<RestartOutcome> {
  const container = await containerFor(dbUrl);
  const startedAt = performance.now();
  await run("docker", ["pause", container]);
  try {
    await sleep(downMs);
  } finally {
    // Unpaused whatever happened while it was frozen: a container left paused
    // takes every later scenario in the run down with it.
    await run("docker", ["unpause", container]).catch(() => {});
  }
  await waitPg(dbUrl, "SELECT 1", 60_000);
  return { downMs: performance.now() - startedAt, container };
}

/** Whether the database is answering right now. */
export async function databaseUp(dbUrl: string): Promise<boolean> {
  try {
    await psql(dbUrl, "SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Have the tool's database record when every transaction committed, so a
 * row's arrival can be read from the row rather than caught by polling.
 *
 * `track_commit_timestamp` takes a restart, which is why it is switched on
 * before the tool starts rather than while it runs. A database that already
 * has it on is left alone. The container shares the host's clock, so a
 * commit time is directly comparable with a block's publication time taken
 * in this process.
 *
 * Returns whether the setting is on. Anything that stops it - a database that
 * is not in a container, a user that cannot run ALTER SYSTEM - leaves the
 * scenario to fall back on polling, not to fail.
 */
export async function trackCommitTimes(dbUrl: string): Promise<boolean> {
  const isOn = async () =>
    (await psql(dbUrl, "SHOW track_commit_timestamp")).trim() === "on";
  if (await isOn()) return true;
  await psql(dbUrl, "ALTER SYSTEM SET track_commit_timestamp = on");
  const container = await containerFor(dbUrl);
  await run("docker", ["restart", container]);
  await waitPg(dbUrl, "SELECT 1", 60_000);
  return isOn();
}
