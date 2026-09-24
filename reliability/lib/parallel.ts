// Running the reliability suite side by side: every run of every scenario of
// every tool is a job, and a pool of workers takes them as slots come free.
//
// The scenarios never needed to run one after another. Each one generates its
// own chain and starts its own database, and nothing one leaves behind is read
// by the next. What kept them apart was only that every copy of a tool asked
// for the same ports, the same container names and the same project directory.
// So a worker gets its own of each - a slot:
//
//   ports       every port shifted by (slot + 1) * 100, see drivers/common.ts
//   containers  suffixed with the slot's name
//   project     a copy of the tool's directory under .reliability-work/
//
// and the price is the one that kept this serial to begin with: runs share a
// machine, so a tool that is slow to react can be slow because a neighbour is
// busy. That reads in the head-latency measures, which are published as the
// median of the repeats and are noisier here than on a machine of their own.
//
// A slot runs one job at a time and is reused, so a pool of N never has more
// than N copies of anything. Before a tool's first run, the tool is prepared
// once on its own (worker.ts --prepare-only): installing a CLI or a binary
// into the one place every copy reads it from is not something two workers
// should do at the same moment.

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { RELIABILITY_DIR } from "./case.ts";
import type { ScenarioResult } from "./play.ts";
import {
  allUnmeasured,
  reportScenario,
  type RunOptions,
} from "./runner.ts";
import { SCENARIOS } from "./scenarios.ts";
import type { ScenarioRun, ToolReliability } from "./score.ts";
import { presentation, type ReliabilityTool } from "./tools.ts";

const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), "worker.ts");
const ROOT = resolve(RELIABILITY_DIR, "..");

/** Where each slot keeps its copies of the projects. Gitignored. */
const WORK_DIR = resolve(ROOT, ".reliability-work");

/** Where each run's full log is written, beside the interleaved one. */
const LOG_DIR = resolve(process.env.RELIABILITY_LOG_DIR ?? resolve(ROOT, "reliability-logs"));

/**
 * The most slots a pool may have. Slot n shifts ports by (n + 1) * 100, and
 * the drivers' ports stay clear of each other only while that shift is under
 * 6,400: 9898 (Envio's metrics) + 6,400 is still below the 19,8xx block.
 */
export const MAX_PARALLEL = 63;

/**
 * How long one worker may live. Longer than anything runOnce allows itself -
 * preparing, the scenario's own backstop and teardown - so this only fires on
 * a worker that hung outside all of them, and turns it into an unmeasured run
 * instead of a pool that never finishes.
 */
const WORKER_TIMEOUT_MS = 90 * 60_000;

/**
 * Which columns go first. The pool finishes when its longest job does, so the
 * slowest columns are started first and the quick ones fill in around them.
 */
const GROUP_ORDER = ["rpc-faults", "reorgs", "crash-recovery", "head-latency", "data-fidelity"];

interface Job {
  tool: ReliabilityTool;
  scenario: string;
  attempt: number;
}

interface Slot {
  index: number;
  name: string;
}

interface WorkerOutcome {
  /** The `RELIABILITY_RUN` payload, when the worker got as far as printing one. */
  result: ScenarioResult | null;
  code: number | null;
}

/** Start one worker in a slot and relay its output until it exits. */
function runWorker(slot: Slot, label: string, args: string[], logFile: string): Promise<WorkerOutcome> {
  mkdirSync(dirname(logFile), { recursive: true });
  const file: WriteStream = createWriteStream(logFile);
  const child = spawn(process.execPath, [WORKER, ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      BENCHMARK_PORT_OFFSET: String((slot.index + 1) * 100),
      BENCHMARK_INSTANCE: slot.name,
      RELIABILITY_WORKDIR: resolve(WORK_DIR, slot.name),
    },
    stdio: ["ignore", "pipe", "pipe"],
    // A group of its own, so a worker that hangs can be killed together with
    // everything it started.
    detached: true,
  });

  let result: ScenarioResult | null = null;
  const relay = (stream: NodeJS.ReadableStream) =>
    new Promise<void>((done) => {
      const lines = createInterface({ input: stream });
      lines.on("line", (line) => {
        if (line.startsWith("RELIABILITY_RUN ")) {
          try {
            result = JSON.parse(line.slice("RELIABILITY_RUN ".length));
          } catch (err) {
            console.log(`[${label}] could not read the run's result: ${err}`);
          }
          return;
        }
        file.write(`${line}\n`);
        console.log(`[${label}] ${line}`);
      });
      lines.on("close", done);
    });
  const relayed = Promise.all([relay(child.stdout!), relay(child.stderr!)]);

  const timer = setTimeout(() => {
    console.log(`[${label}] still running after ${WORKER_TIMEOUT_MS / 60_000} minutes; killing it`);
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {}
  }, WORKER_TIMEOUT_MS);

  return new Promise((done) => {
    child.on("close", async (code) => {
      clearTimeout(timer);
      await relayed;
      file.end();
      done({ result, code });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      console.log(`[${label}] could not start: ${err.message}`);
      file.end();
      done({ result: null, code: null });
    });
  });
}

export async function runParallel(
  options: RunOptions & { parallel: number }
): Promise<ToolReliability[]> {
  const size = Math.min(options.parallel, MAX_PARALLEL);
  if (options.patience) {
    // A test hook for the in-process runner, which workers have no way to
    // be handed - and nothing that runs them needs one.
    throw new Error("a custom patience is only supported when running serially");
  }

  const groupOf = (scenario: string) =>
    GROUP_ORDER.indexOf(SCENARIOS.find((s) => s.id === scenario)?.group ?? "");
  const jobs: Job[] = options.tools
    .flatMap((tool) =>
      options.scenarios.flatMap((scenario) =>
        Array.from({ length: options.repeats }, (_, i) => ({ tool, scenario, attempt: i + 1 }))
      )
    )
    // Stable: within a column, scenarios in catalog order and tools taking
    // turns, so every tool is started early rather than one at a time.
    .sort(
      (a, b) =>
        groupOf(a.scenario) - groupOf(b.scenario) ||
        options.scenarios.indexOf(a.scenario) - options.scenarios.indexOf(b.scenario) ||
        a.attempt - b.attempt
    );

  console.log(
    `Running ${jobs.length} run(s) of ${options.scenarios.length} scenario(s) across ` +
      `${options.tools.length} tool(s), ${size} at a time. Each run's full log is in ${LOG_DIR}.`
  );

  const free: Slot[] = Array.from({ length: size }, (_, index) => ({
    index,
    name: `slot${index}`,
  }));
  const prepared = new Set<ReliabilityTool>();
  const warming = new Set<ReliabilityTool>();
  const attempts = new Map<string, ScenarioResult[]>();
  const runs = new Map<ReliabilityTool, ScenarioRun[]>(options.tools.map((t) => [t, []]));
  const results: ToolReliability[] = [];
  const running = new Set<Promise<void>>();
  const startedAt = performance.now();
  const elapsed = () => `${((performance.now() - startedAt) / 60_000).toFixed(1)} min`;

  const occupy = (work: (slot: Slot) => Promise<void>) => {
    const slot = free.shift()!;
    const task = work(slot).finally(() => {
      free.push(slot);
      running.delete(task);
    });
    running.add(task);
  };

  const finish = (job: Job, result: ScenarioResult) => {
    const key = `${job.tool}|${job.scenario}`;
    const done = [...(attempts.get(key) ?? []), result];
    attempts.set(key, done);
    if (done.length < options.repeats) return;
    reportScenario(
      job.tool,
      options.scenarios,
      runs.get(job.tool)!,
      job.scenario,
      done,
      `\n=== ${job.tool} / ${job.scenario} (${done.length} run(s), ${elapsed()} in) ===`
    );
    if (runs.get(job.tool)!.length === options.scenarios.length) {
      const result: ToolReliability = { ...presentation(job.tool), runs: runs.get(job.tool)! };
      results.push(result);
      options.emit?.(result);
    }
  };

  const pending = [...jobs];
  while (pending.length > 0 || running.size > 0) {
    while (free.length > 0) {
      // A tool nobody has prepared yet is prepared first, on a slot of its own.
      const cold = options.tools.find(
        (tool) =>
          !prepared.has(tool) && !warming.has(tool) && pending.some((job) => job.tool === tool)
      );
      if (cold) {
        warming.add(cold);
        occupy(async (slot) => {
          const label = `${cold} / prepare`;
          console.log(`[${label}] preparing on ${slot.name} (${elapsed()} in)`);
          const { code } = await runWorker(
            slot,
            label,
            [cold, "--prepare-only"],
            resolve(LOG_DIR, cold, "prepare.log")
          );
          // A failure here is reported by the runs themselves, which prepare
          // again and say what went wrong in the table.
          if (code !== 0) console.log(`[${label}] failed (exit ${code}); running anyway`);
          warming.delete(cold);
          prepared.add(cold);
        });
        continue;
      }
      const next = pending.findIndex((job) => prepared.has(job.tool));
      if (next === -1) break;
      const [job] = pending.splice(next, 1);
      occupy(async (slot) => {
        const label = `${job.tool} / ${job.scenario} #${job.attempt}`;
        console.log(`[${label}] starting on ${slot.name} (${elapsed()} in)`);
        const began = performance.now();
        const { result, code } = await runWorker(
          slot,
          label,
          [job.tool, job.scenario, String(job.attempt)],
          resolve(LOG_DIR, job.tool, `${job.scenario}-${job.attempt}.log`)
        );
        console.log(
          `[${label}] finished in ${((performance.now() - began) / 1_000).toFixed(0)}s`
        );
        finish(
          job,
          result ??
            allUnmeasured(
              job.scenario,
              `the run's worker exited without a result (exit ${code}); see its log`
            )
        );
      });
    }
    if (running.size === 0) break;
    await Promise.race(running);
  }

  console.log(`\nAll runs finished in ${elapsed()}.`);
  return results;
}
