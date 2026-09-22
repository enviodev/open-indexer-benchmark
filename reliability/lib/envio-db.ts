// The Postgres both Envio rows expect to find already running.
//
// Every other tool brings its own database up - a container of its own, or a
// compose file in its project. HyperIndex does not: it connects to a Postgres
// on a fixed port and fails to initialize its storage if nothing answers
// there. The throughput suite satisfies that with a service container declared
// in its workflow, which is invisible to anyone running a case by hand, and
// was invisible to this suite until both Envio rows indexed nothing at all.
//
// So the suite starts it, and only when a run actually needs it. A Postgres
// already publishing the port is left alone, whoever started it: a service
// container in CI answers the same as a container started here, and the
// database-restart scenario stops and starts it by published port either way.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { waitPg } from "../../cases/lib/process.ts";
import { ENVIO_DB_URL } from "../../cases/lib/drivers/envio.ts";

const run = promisify(execFile);

/** The container this module starts, so a second call does not start another. */
const CONTAINER = "reliability-envio-postgres";

const PORT = new URL(ENVIO_DB_URL).port;

/** Whether a tool reads the database HyperIndex insists on. */
export function needsEnvioDb(tool: string): boolean {
  return tool.startsWith("envio");
}

/**
 * Make sure something is answering on Envio's port, and leave it running.
 *
 * Deliberately not torn down between tools: the next Envio scenario wants it,
 * and a container left behind on a throwaway runner costs nothing. Locally,
 * `docker rm -f reliability-envio-postgres` reclaims it.
 */
export async function ensureEnvioDb(log: (message: string) => void): Promise<void> {
  const { stdout } = await run("docker", [
    "ps",
    "--filter",
    `publish=${PORT}`,
    "--format",
    "{{.Names}}",
  ]);
  if (stdout.trim().length > 0) return;

  log(`Starting Postgres on port ${PORT} for Envio...`);
  // A stopped container from an earlier run would make `docker run` fail on
  // the name alone, which is not a reason to lose the suite.
  await run("docker", ["rm", "-f", CONTAINER]).catch(() => {});
  const url = new URL(ENVIO_DB_URL);
  await run("docker", [
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    `POSTGRES_USER=${url.username}`,
    "-e",
    `POSTGRES_PASSWORD=${url.password}`,
    "-e",
    `POSTGRES_DB=${url.pathname.slice(1)}`,
    "-p",
    `${PORT}:5432`,
    "postgres:16",
  ]);
  await waitPg(ENVIO_DB_URL, "SELECT 1");
}
