// Process and PostgreSQL helpers shared by the drivers.
//
// Kept apart from the drivers so the runner can reach psql for verification
// without importing every driver, and so a driver file is only ever about the
// indexer it drives.

import { spawn, type ChildProcess } from "node:child_process";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run a command to completion, inheriting stdio. */
export function exec(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd, stdio: "inherit", env });
    p.on("exit", (code) =>
      code === 0
        ? res()
        : rej(new Error(`"${cmd} ${args.join(" ")}" exited with code ${code}`))
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
  const p = spawn(cmd, args, { cwd, stdio: "pipe", detached: true, env });
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

/** Run a SQL query via psql and return the trimmed stdout. */
export function psql(connStr: string, query: string): Promise<string> {
  return new Promise((res, rej) => {
    const p = spawn("psql", [connStr, "-t", "-A", "-c", query], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    p.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    p.on("exit", (code) =>
      code === 0 ? res(stdout.trim()) : rej(new Error(`psql failed (${code}): ${stderr}`))
    );
  });
}

/** Poll a PostgreSQL database until the given query succeeds. */
export async function waitPg(connStr: string, query: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await psql(connStr, query);
      return;
    } catch {
      await sleep(1_000);
    }
  }
  throw new Error(
    `PostgreSQL ${connStr} did not become ready within ${timeoutMs / 1000}s`
  );
}
