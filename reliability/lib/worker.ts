// One run of one scenario against one tool, in a process of its own.
//
//   node reliability/lib/worker.ts <tool> <scenario> <attempt>
//   node reliability/lib/worker.ts <tool> --prepare-only
//
// Started by the pool in parallel.ts, never by hand. What makes it safe to run
// several of these at once is all in the environment the pool gives it:
//
//   BENCHMARK_PORT_OFFSET  shifts every port the drivers and the chain bind
//   BENCHMARK_INSTANCE     suffixes every container the drivers name
//   RELIABILITY_WORKDIR    where this worker keeps its own copy of the project
//
// The first two are read by cases/lib/drivers/common.ts when it is loaded,
// which is why this is a process and not a function: the drivers' ports are
// module constants, shared by the throughput suite, and a process is the one
// place each copy of them can differ.
//
// The result is printed as one `RELIABILITY_RUN <json>` line on stdout; the
// pool reads it and echoes everything else with the run's name in front.

import { execFile } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { DRIVERS } from "../../cases/lib/drivers/index.ts";
import { cancellable, killStarted } from "../../cases/lib/process.ts";
import { NO_END_BLOCK, RELIABILITY_CASE, RELIABILITY_DIR, baseChainSpec } from "./case.ts";
import { CHAIN_PORT, startChainMock } from "./chain-mock.ts";
import { port, INSTANCE } from "../../cases/lib/drivers/common.ts";
import { ensureEnvioDb, needsEnvioDb, removeEnvioDb } from "./envio-db.ts";
import { pauseDatabase, restartDatabase } from "./db-control.ts";
import { DEFAULT_PATIENCE } from "./play.ts";
import { runOnce } from "./runner.ts";
import { PROJECT_DIRS, runsHere } from "./tools.ts";

const [tool, scenario, attemptArg] = process.argv.slice(2);
const prepareOnly = scenario === "--prepare-only";
const workdir = process.env.RELIABILITY_WORKDIR;

if (!tool || !runsHere(tool) || !scenario || !workdir || !INSTANCE) {
  console.error(
    "usage: RELIABILITY_WORKDIR=… BENCHMARK_INSTANCE=… BENCHMARK_PORT_OFFSET=… " +
      "node reliability/lib/worker.ts <tool> (<scenario> <attempt> | --prepare-only)"
  );
  process.exit(2);
}

const log = (message: string) => console.log(message);

// This worker's own copy of the project, refreshed from the repository and
// otherwise left as the last run in this slot left it: node_modules is kept,
// so installing is a check rather than an install, and whatever a run built
// is cleaned by the driver's own prepare() the same way it is in place.
const projectDir = PROJECT_DIRS[tool];
mkdirSync(workdir, { recursive: true });
cpSync(resolve(RELIABILITY_DIR, projectDir), resolve(workdir, projectDir), {
  recursive: true,
  force: true,
  filter: (source) => !source.split(/[\\/]/).includes("node_modules"),
});
const config = { ...RELIABILITY_CASE, dir: workdir };

// Compose names a project after its directory, which every copy shares, and
// two workers in one compose project would take each other's database down.
process.env.COMPOSE_PROJECT_NAME = `${projectDir}-${INSTANCE}`;

// Interrupted, the run never reaches its own teardown, so this does the part
// that would otherwise outlive it: the indexer, which runs in a process group
// of its own, and whatever the slot has in Docker - every container this
// worker names carries the slot's name, and compose's under its project.
const docker = promisify(execFile);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    console.log(`${signal}: tearing ${tool} down`);
    killStarted();
    await docker("docker", ["compose", "-p", process.env.COMPOSE_PROJECT_NAME!, "down", "-v"], {
      timeout: 60_000,
    }).catch(() => {});
    const { stdout } = await docker(
      "docker",
      ["ps", "-aq", "--filter", `name=-${INSTANCE}(-|$)`],
      { timeout: 30_000 }
    ).catch(() => ({ stdout: "" }));
    const ids = stdout.split("\n").filter(Boolean);
    if (ids.length > 0) {
      await docker("docker", ["rm", "-fv", ...ids], { timeout: 60_000 }).catch(() => {});
    }
    process.exit(130);
  });
}

try {
  if (needsEnvioDb(tool)) await ensureEnvioDb(log);

  if (prepareOnly) {
    // Everything a tool installs once and keeps outside its project - a CLI,
    // a binary, images, the package store - is fetched by its first
    // prepare(). Doing that once per tool before the runs start means the
    // runs find it there, rather than several of them racing to write it.
    const chain = await startChainMock({ ...baseChainSpec(), port: port(CHAIN_PORT) });
    const driver = DRIVERS[tool]({ config, rpcUrl: chain.url, endBlock: NO_END_BLOCK });
    try {
      await driver.prepare();
    } finally {
      await cancellable(() => driver.cleanup()).promise.catch(() => {});
      await chain.close();
    }
  } else {
    const result = await runOnce(
      tool,
      DRIVERS[tool],
      scenario,
      Number(attemptArg ?? 1),
      log,
      restartDatabase,
      DEFAULT_PATIENCE,
      pauseDatabase,
      config
    );
    console.log(`RELIABILITY_RUN ${JSON.stringify(result)}`);
  }
} catch (err) {
  console.error(`worker failed: ${(err as Error)?.stack ?? err}`);
  process.exitCode = 1;
} finally {
  // Each worker's database is its own, so it goes with the worker.
  if (needsEnvioDb(tool)) await removeEnvioDb();
}

// As in run.ts: anything a tool left open would otherwise keep this process,
// and the pool slot it holds, alive.
process.exit();
