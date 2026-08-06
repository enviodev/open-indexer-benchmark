// The PostgreSQL a tool writes to, and the switch that takes it away.
//
// The throughput benchmark lets each tool bring its own database, because there
// what is measured is the tool's own write path end to end. Reliability asks a
// different question — what happens when the database goes away — and that only
// compares across tools if it is the *same* database going away in the same
// manner. So the container is defined here once, and every tool gets an
// identical one: same image, same settings, same commands used to break it.
//
// One container per tool rather than one for the whole run, so tools can be
// measured concurrently. Nothing about the comparison depends on them sharing a
// process — it depends on them being alike, which is what this file guarantees
// — and a single shared container could not be stopped for one tool without
// stopping it under every other tool at the same time.
//
// Stopping the container rather than the process is deliberate: `docker stop`
// gives PostgreSQL a chance to shut down cleanly, `docker kill` does not (so it
// replays its WAL on the way back up), and `docker pause` leaves the TCP
// connections open and silent, which is what a database under a lock storm or a
// failing disk looks like from the client side. Tools fail differently under
// each, and a benchmark that only tested the polite one would say so wrongly.

import { exec, psql, sleep, waitPg } from "../../cases/lib/process.ts";

const IMAGE = "postgres:17-alpine";
const PASSWORD = "reliability";

/** First port of the per-tool range; each instance takes the next one. */
export const BASE_PORT = 5442;

/** How a scenario took the database away, for the record it leaves behind. */
export type OutageKind = "stop" | "kill" | "pause";

export interface PostgresOptions {
  /** Container name. Must be unique across concurrently running tools. */
  name: string;
  port: number;
}

export class PostgresServer {
  readonly port: number;
  private readonly container: string;

  constructor(options: PostgresOptions) {
    this.container = options.name;
    this.port = options.port;
  }

  /** Connection string for the maintenance database. */
  get adminUrl(): string {
    return this.urlFor("postgres");
  }

  urlFor(database: string): string {
    return `postgresql://postgres:${PASSWORD}@127.0.0.1:${this.port}/${database}`;
  }

  /**
   * The same database as seen from inside a container. Only SubQuery needs it —
   * its node runs in Docker — and it only resolves because the driver's compose
   * file adds the host-gateway mapping.
   */
  containerUrlFor(database: string): string {
    return `postgresql://postgres:${PASSWORD}@host.docker.internal:${this.port}/${database}`;
  }

  async start(): Promise<void> {
    await exec("docker", ["rm", "-f", this.container], process.cwd()).catch(() => {});
    await exec("docker", [
      "run", "-d", "--name", this.container,
      "-e", `POSTGRES_PASSWORD=${PASSWORD}`,
      // Graph Node refuses a database that is not UTF8/C.
      "-e", "POSTGRES_INITDB_ARGS=-E UTF8 --locale=C",
      "-p", `${this.port}:5432`,
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
    // SubQuery stores historical entity versions in a GiST index over a range
    // column, which needs btree_gist, and refuses to start without it. Every
    // tool gets the same database, so the extension is created for all of them
    // rather than special-cased — it costs nothing to a tool that never uses
    // it, and a per-tool database differing in what it supports would be
    // exactly the kind of unevenness this file exists to prevent.
    await psql(this.urlFor(name), "CREATE EXTENSION IF NOT EXISTS btree_gist");
  }

  /** Take the database away. Returns once the container has actually stopped. */
  async outage(kind: OutageKind): Promise<void> {
    const command =
      kind === "kill" ? ["kill", this.container]
      : kind === "pause" ? ["pause", this.container]
      : ["stop", "-t", "5", this.container];
    await exec("docker", command, process.cwd());
  }

  /** Bring it back and wait until it answers queries again. */
  async restore(kind: OutageKind): Promise<number> {
    const startedAt = performance.now();
    await exec(
      "docker",
      kind === "pause" ? ["unpause", this.container] : ["start", this.container],
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
    await exec("docker", ["rm", "-f", this.container], process.cwd()).catch(() => {});
  }
}
