// What a reliability driver has to provide, and the process handling they share.
//
// This is deliberately not the benchmark's driver interface. That one exists to
// measure a clean run, so its `launch` wipes state every time and its `stop` is
// always polite. Here the whole point is the messy run: a launch has to resume
// whatever the last one left behind, a stop has to be able to be a SIGKILL, and
// an exit the harness did not ask for has to be visible rather than absorbed.

import { spawn, type ChildProcess } from "node:child_process";
import type { PostgresServer } from "../postgres.ts";

export interface DriverContext {
  /** The tool's project directory, `reliability/<tool>`. */
  dir: string;
  /** Mock endpoint as reachable from the host. */
  rpcUrl: string;
  /** Mock endpoint as reachable from inside a container. */
  rpcContainerUrl: string;
  db: PostgresServer;
  /** Database inside the shared server that this tool writes to. */
  database: string;
  startBlock: number;
  /**
   * Where to stop, or null to follow the head indefinitely — which is what
   * every scenario but the plain catch-up ones wants, since the harness decides
   * when the run is over.
   */
  endBlock: number | null;
}

export interface ProcessExit {
  code: number | null;
  signal: string | null;
  /** Wall-clock ms at which the process went away. */
  at: number;
}

export interface ReliabilityDriver {
  /** Connection string the harness reads the tool's rows from. */
  url: string;
  /** Restrict introspection to these schemas, for tools that create many. */
  schemas?: string[];
  /** Install, build and generate. Leaves nothing running. */
  prepare(): Promise<void>;
  /**
   * Start indexing, resuming from whatever is already in the database. Called
   * again by the harness after every crash, so it must be safe to call on a
   * half-written state.
   */
  launch(): Promise<void>;
  stop(signal?: NodeJS.Signals): Promise<void>;
  cleanup(): Promise<void>;
  alive(): boolean;
  /** The last unexpected exit, or null while the process is up. */
  exit(): ProcessExit | null;
  /** The last lines the tool logged, so a failure can be reported with its cause. */
  output(lines?: number): string[];
}

export type DriverFactory = (ctx: DriverContext) => ReliabilityDriver;

/**
 * A long-running child, its output prefixed and its exit recorded.
 *
 * Output is kept rather than discarded: when a tool dies under chaos, the last
 * few lines it wrote are the difference between "crashed 3 times" and "crashed
 * 3 times, every one of them on `invalid byte sequence for encoding UTF8`".
 */
export class Supervised {
  private proc: ChildProcess | null = null;
  private lastExit: ProcessExit | null = null;
  private readonly tail: string[] = [];
  private readonly label: string;
  private readonly quiet: boolean;
  /**
   * Every process group this instance has ever spawned. A tool's top-level
   * process can exit while a child of it is still shutting down and still
   * holding its listening port, and the next launch then dies on EADDRINUSE —
   * a crash the harness caused and would have published as the tool's. So
   * nothing is ever launched without first making sure the last one is gone.
   */
  private readonly spawned = new Set<number>();

  constructor(label: string, options: { quiet?: boolean } = {}) {
    this.label = label;
    this.quiet = options.quiet ?? process.env.RELIABILITY_VERBOSE !== "1";
  }

  start(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): void {
    this.reap();
    this.lastExit = null;
    const proc = spawn(cmd, args, { cwd, stdio: "pipe", detached: true, env });
    this.proc = proc;
    if (proc.pid) this.spawned.add(proc.pid);
    for (const stream of [proc.stdout, proc.stderr]) {
      stream?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (!line.trim()) continue;
          this.tail.push(line);
          if (this.tail.length > 80) this.tail.shift();
          if (!this.quiet) console.log(`    ${this.label} | ${line}`);
        }
      });
    }
    proc.on("exit", (code, signal) => {
      // The pid stays in `spawned` even though this process is gone: it is a
      // process *group* id, and children of a tool that has exited can outlive
      // it and keep holding its listening port. Only reap() clears the set,
      // once it has actually signalled the group.
      if (this.proc === proc) {
        this.lastExit = { code, signal, at: Date.now() };
        this.proc = null;
      }
    });
    // A process that fails to spawn at all never emits "exit".
    proc.on("error", () => {
      if (this.proc === proc) {
        this.lastExit = { code: null, signal: "SPAWN_FAILED", at: Date.now() };
        this.proc = null;
      }
    });
  }

  alive(): boolean {
    return this.proc !== null;
  }

  exit(): ProcessExit | null {
    return this.lastExit;
  }

  /** The last lines the process wrote, for a crash note. */
  output(lines = 12): string[] {
    return this.tail.slice(-lines);
  }

  /** SIGKILL any process group this instance started that is still around. */
  private reap(): void {
    for (const pid of this.spawned) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // Already gone, which is the outcome we wanted.
      }
      this.spawned.delete(pid);
    }
  }

  /**
   * Stop the process group. SIGKILL is delivered immediately and is what the
   * crash scenarios use; anything else is followed by a SIGKILL if the process
   * is still there five seconds later.
   */
  async stop(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    const proc = this.proc;
    if (!proc?.pid) {
      this.reap();
      return;
    }
    this.proc = null;
    const pid = proc.pid;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {}
        finish();
      }, signal === "SIGKILL" ? 2_000 : 5_000);
      proc.on("exit", finish);
      if (proc.exitCode !== null || proc.signalCode !== null) finish();
      try {
        process.kill(-pid, signal);
      } catch {
        try {
          proc.kill(signal);
        } catch {}
        finish();
      }
    });
    this.reap();
    // The harness asked for this one, so it is not an unexpected exit.
    this.lastExit = null;
  }
}
