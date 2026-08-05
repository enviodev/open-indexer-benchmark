// The one PostgreSQL every tool under test writes to, and the switch that takes
// it away.
//
// The throughput benchmark lets each tool bring its own database, because there
// what is measured is the tool's own write path end to end. Reliability asks a
// different question — what happens when the database goes away — and that only
// compares across tools if it is the *same* database going away in the same
// manner. So one container is started here, each tool gets a database inside
// it, and the scenarios stop, kill and pause that container out from under
// whichever tool is running.
//
// Stopping the container rather than the process is deliberate: `docker stop`
// gives PostgreSQL a chance to shut down cleanly, `docker kill` does not (so it
// replays its WAL on the way back up), and `docker pause` leaves the TCP
// connections open and silent, which is what a database under a lock storm or a
// failing disk looks like from the client side. Tools fail differently under
// each, and a benchmark that only tested the polite one would say so wrongly.

import { exec, psql, sleep, waitPg } from "../../cases/lib/process.ts";

const CONTAINER = "reliability-postgres";
const IMAGE = "postgres:17-alpine";
const PORT = 5442;
const PASSWORD = "reliability";

/** How a scenario took the database away, for the record it leaves behind. */
export type OutageKind = "stop" | "kill" | "pause";

export class PostgresServer {
  readonly port = PORT;

  /** Connection string for the maintenance database. */
  get adminUrl(): string {
    return this.urlFor("postgres");
  }

  urlFor(database: string): string {
    return `postgresql://postgres:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
  }

  /**
   * The same database as seen from inside a container. Only SubQuery needs it —
   * its node runs in Docker — and it only resolves because the driver adds the
   * host-gateway mapping.
   */
  containerUrlFor(database: string): string {
    return `postgresql://postgres:${PASSWORD}@host.docker.internal:${PORT}/${database}`;
  }

  async start(): Promise<void> {
    await exec("docker", ["rm", "-f", CONTAINER], process.cwd()).catch(() => {});
    await exec("docker", [
      "run", "-d", "--name", CONTAINER,
      "-e", `POSTGRES_PASSWORD=${PASSWORD}`,
      // Graph Node refuses a database that is not UTF8/C.
      "-e", "POSTGRES_INITDB_ARGS=-E UTF8 --locale=C",
      "-p", `${PORT}:5432`,
      IMAGE,
      // A small shared_buffers keeps the container's restart quick, which
      // matters when a scenario cycles it a dozen times.
      "-c", "shared_buffers=128MB",
      "-c", "max_connections=200",
    ], process.cwd());
    await waitPg(this.adminUrl, "SELECT 1", 60_000);
  }

  /** Drop and recreate a tool's database, so a scenario starts from nothing. */
  async resetDatabase(name: string): Promise<void> {
    await psql(this.adminUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await psql(this.adminUrl, `CREATE DATABASE "${name}"`);
  }

  /** Take the database away. Returns once the container has actually stopped. */
  async outage(kind: OutageKind): Promise<void> {
    const command =
      kind === "kill" ? ["kill", CONTAINER]
      : kind === "pause" ? ["pause", CONTAINER]
      : ["stop", "-t", "5", CONTAINER];
    await exec("docker", command, process.cwd());
  }

  /** Bring it back and wait until it answers queries again. */
  async restore(kind: OutageKind): Promise<number> {
    const startedAt = performance.now();
    await exec(
      "docker",
      kind === "pause" ? ["unpause", CONTAINER] : ["start", CONTAINER],
      process.cwd()
    );
    await waitPg(this.adminUrl, "SELECT 1", 120_000);
    return performance.now() - startedAt;
  }

  /** True while the container answers. Used to confirm an outage really landed. */
  async reachable(): Promise<boolean> {
    try {
      // `docker pause` leaves the socket open and silent, so an unbounded query
      // would hang here for as long as the pause lasts rather than reporting it.
      await Promise.race([
        psql(this.adminUrl, "SELECT 1"),
        sleep(3_000).then(() => {
          throw new Error("timed out");
        }),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async stopContainer(): Promise<void> {
    await exec("docker", ["rm", "-f", CONTAINER], process.cwd()).catch(() => {});
  }
}
