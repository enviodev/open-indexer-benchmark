// Process and PostgreSQL helpers shared by the drivers.
//
// Kept apart from the drivers so the runner can reach psql for verification
// without importing every driver, and so a driver file is only ever about the
// indexer it drives.

import { AsyncLocalStorage } from "node:async_hooks";
import { spawn, type ChildProcess } from "node:child_process";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Work that can be abandoned ─────────────────────────────────────────

/** The processes one piece of cancellable work has started, and whether it was cancelled. */
interface Scope {
  cancelled: boolean;
  processes: Set<ChildProcess>;
}

const scopes = new AsyncLocalStorage<Scope>();

/** Work started by `cancellable`, and the means to abandon it. */
export interface Cancellable<T> {
  promise: Promise<T>;
  /** Kill what it is running, refuse what it starts next, and say how many were killed. */
  cancel(): number;
}

/**
 * Run work that a caller may stop waiting for.
 *
 * A promise cannot be cancelled, and killing the process it is waiting on is
 * not enough either: a driver that catches the failure goes on to its next
 * step, starting new commands after the caller has moved on - a `docker
 * compose` nobody is waiting for, underneath whatever runs next. So every
 * command `exec`, `psql` or `start` launches inside the work belongs to it,
 * and once it is cancelled those are killed and any it tries to launch after
 * that are refused. Commands outside it, such as the teardown that follows,
 * are not affected.
 */
export function cancellable<T>(work: () => Promise<T>): Cancellable<T> {
  const scope: Scope = { cancelled: false, processes: new Set() };
  return {
    promise: scopes.run(scope, async () => work()),
    cancel() {
      scope.cancelled = true;
      const count = scope.processes.size;
      for (const p of scope.processes) p.kill("SIGKILL");
      scope.processes.clear();
      return count;
    },
  };
}

/** Why a command may not start: the work it belongs to was cancelled. */
function refusal(cmd: string): Error | null {
  return scopes.getStore()?.cancelled
    ? new Error(`"${cmd}" was not started: the work it belongs to was abandoned`)
    : null;
}

/** Count a process against the cancellable work that started it, if any. */
function adopt(p: ChildProcess) {
  const scope = scopes.getStore();
  if (!scope) return;
  scope.processes.add(p);
  p.on("close", () => scope.processes.delete(p));
}

/**
 * Every process `start` launched that has not exited, whoever launched it.
 * They run in process groups of their own, so nothing reaches them when the
 * harness itself is interrupted unless it goes looking - see `killStarted`.
 */
const started = new Set<ChildProcess>();

/**
 * Kill everything `start` launched and is still running, group and all.
 * For a harness that is being interrupted and will not get to stop its
 * indexers the orderly way.
 */
export function killStarted(): number {
  const count = started.size;
  for (const p of started) {
    try {
      process.kill(-p.pid!, "SIGKILL");
    } catch {}
  }
  started.clear();
  return count;
}

/** Run a command to completion, inheriting stdio. */
export function exec(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((res, rej) => {
    const refused = refusal(cmd);
    if (refused) return rej(refused);
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env });
    adopt(p);
    p.on("exit", (code, signal) =>
      code === 0
        ? res()
        : rej(new Error(`"${cmd} ${args.join(" ")}" exited with code ${code ?? signal}`))
    );
  });
}

/** Spawn a long-running process, forwarding output with an indent. */
export function start(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): ChildProcess {
  const refused = refusal(cmd);
  if (refused) throw refused;
  const p = spawn(cmd, args, { cwd, stdio: "pipe", detached: true, env });
  adopt(p);
  started.add(p);
  p.on("close", () => started.delete(p));
  // A binary that is not there raises an `error` event and no `exit`, and an
  // unhandled `error` takes the whole harness down with it - one tool whose
  // CLI failed to install would end the run for every other. Reporting it as
  // an exit instead leaves it as what it is: a tool that is not running, which
  // every driver already knows how to see.
  p.on("error", (err: Error) => {
    console.log(`  ${cmd} could not be started: ${err.message}`);
    p.emit("exit", 127, null);
  });
  for (const stream of [p.stdout, p.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (line) console.log(`  ${line}`);
      }
    });
  }
  return p;
}

/** Kill a process and its entire process group. */
export function kill(proc: ChildProcess | null): Promise<void> {
  // A process killed by a signal reports exitCode null and signalCode set, so
  // exitCode alone reads as "still running". Waiting on an `exit` event that
  // already fired would then stall for the full SIGKILL timeout on every stop.
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve();
  }
  const pid = proc.pid;
  return new Promise((res) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
      res();
    }, 5_000);
    proc.on("exit", () => {
      clearTimeout(timer);
      res();
    });
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {}
    }
  });
}

/**
 * Send a signal to a process and its group, without waiting for it to die.
 *
 * `kill` above is the orderly stop every phase ends with. This is for the
 * reliability scenarios that are about how an indexer dies: SIGKILL with no
 * chance to flush, or SIGTERM with the harness watching whether it takes it.
 * Returns false when there is nothing running to signal.
 */
export function signalGroup(
  proc: ChildProcess | null,
  signal: NodeJS.Signals
): boolean {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return false;
  try {
    process.kill(-proc.pid, signal);
    return true;
  } catch {
    try {
      proc.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Run a SQL query via psql and return the trimmed stdout.
 *
 * The query goes in on stdin rather than as an argument. Linux caps a single
 * argument at 128 KB, and a query over that fails as `spawn E2BIG` - an error
 * that names nothing about SQL and takes a while to recognise. Every query the
 * benchmark issues today is far under the cap, but nothing enforces that, and
 * the first one that is not would fail somewhere far from here.
 *
 * `-f -` also runs several statements as several statements, where `-c` wraps
 * them in one implicit transaction. Nothing here passes more than one, and a
 * caller that wants them atomic should say BEGIN and COMMIT rather than rely
 * on which flag the helper happens to use.
 */
export function psql(
  connStr: string,
  query: string,
  { timeoutMs }: { timeoutMs?: number } = {}
): Promise<string> {
  return new Promise((res, rej) => {
    const refused = refusal("psql");
    if (refused) return rej(refused);
    const p = spawn("psql", [connStr, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      // libpq waits for ever by default, on a connection and on a statement.
      // A database that is frozen, or a table another session holds an
      // exclusive lock on, then hangs whoever asked - so a caller that polls
      // can bound each question, and gets an error back rather than no answer.
      env: timeoutMs
        ? {
            ...process.env,
            PGCONNECT_TIMEOUT: String(Math.max(2, Math.ceil(timeoutMs / 3_000))),
            PGOPTIONS: `${process.env.PGOPTIONS ?? ""} -c statement_timeout=${timeoutMs}`.trim(),
          }
        : process.env,
    });
    adopt(p);
    // The server-side timeout cannot help while psql is still waiting to get
    // through, so the process itself is bounded too.
    const timer = timeoutMs
      ? setTimeout(() => {
          p.kill("SIGKILL");
          rej(new Error(`psql did not answer within ${timeoutMs}ms`));
        }, timeoutMs + 5_000)
      : undefined;
    p.on("close", () => clearTimeout(timer));
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    p.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    p.on("error", rej);
    // A psql that cannot connect exits before the query is written, and the
    // write then fails with EPIPE - which, unhandled, takes the process down.
    // The exit code is what the failure is reported from, so the broken pipe
    // is ignored. The reliability suite takes databases away on purpose, so
    // this is a normal path there rather than an edge case.
    p.stdin?.on("error", () => {});
    p.on("exit", (code) =>
      code === 0 ? res(stdout.trim()) : rej(new Error(`psql failed (${code}): ${stderr}`))
    );
    p.stdin?.end(query);
  });
}

/** Poll a PostgreSQL database until the given query succeeds. */
export async function waitPg(connStr: string, query: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Each attempt is bounded by what is left of the deadline, so a
      // database that accepts the connection and never answers cannot hold
      // this past it.
      await psql(connStr, query, { timeoutMs: Math.max(1_000, deadline - Date.now()) });
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(
    `PostgreSQL ${connStr} did not become ready within ${timeoutMs / 1000}s`
  );
}
