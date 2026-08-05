// Runs one tool through one scenario, and records what it cost.
//
// The harness owns everything outside the indexer: the chain, the endpoint, the
// database, and the process. A scenario is handed those and told to misbehave;
// its only job is to decide what to break and what "correct" means afterwards.
//
// Two things are counted for every scenario whether it asks for them or not.
//
//   Crashes — an exit the harness did not ask for. Tools differ enormously
//   here: some treat a dropped database connection as a retryable error and
//   some treat it as a reason to die, and a tool that dies is a tool somebody
//   has to restart at three in the morning. By default the harness restarts it
//   and keeps going, so a crash is a cost rather than an end to the run, and
//   the count is published next to the correctness verdict.
//
//   Recovery time — how long from the restart to the tool making progress
//   again. A tool that comes back in two seconds and one that comes back in two
//   minutes both "recover", and the difference is the whole story.

import { resolve } from "node:path";
import { sleep } from "../../cases/lib/process.ts";
import { MockChain, type ChainOptions } from "./chain.ts";
import { MockRpcServer } from "./rpc-server.ts";
import type { PostgresServer } from "./postgres.ts";
import { DRIVERS, TOOL_INFO, type ReliabilityDriver } from "./drivers/index.ts";
import {
  ENTITIES,
  diffRows,
  expectedRows,
  highestIndexedBlock,
  type RowDiff,
} from "./entities.ts";
import { readRows, resolveEntities, type ResolvedEntity } from "./introspect.ts";

/** Port the mock endpoint binds, so a stuck run is easy to find and curl. */
const RPC_PORT = 19_890;

export type CheckStatus = "pass" | "degraded" | "fail";

/** One named thing a scenario asserted, e.g. a single reorg shape. */
export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface ScenarioOutcome {
  status: CheckStatus | "error";
  /** Published as the note under the results table. */
  detail: string;
  checks?: Check[];
  metrics?: Record<string, number | string>;
}

export interface Crash {
  at: number;
  code: number | null;
  signal: string | null;
  /** The last lines the tool logged before going away. */
  output: string[];
  /** Milliseconds until it made progress again after being restarted. */
  recoveredAfterMs: number | null;
}

export interface ScenarioContext {
  tool: string;
  chain: MockChain;
  rpc: MockRpcServer;
  db: PostgresServer;
  driver: ReliabilityDriver;
  log(message: string): void;

  /** Start the tool. Supervision begins with it. */
  start(): Promise<void>;
  /** Stop the tool without recording a crash. */
  halt(signal?: NodeJS.Signals): Promise<void>;
  /**
   * Stop restarting the tool automatically. A scenario that kills the process
   * on purpose turns this off first, so its own kill is not double-counted.
   */
  setSupervision(enabled: boolean): void;
  /** Restart now, counting neither a crash nor a recovery. */
  restart(): Promise<void>;

  /** Highest block the tool has written rows for, or -1 if it has written none. */
  progress(): Promise<number>;
  /** Wait for the tool to have written rows for `block`. */
  waitForBlock(block: number, timeoutMs: number): Promise<boolean>;
  /**
   * Wait for the tool to get through every block that existed when this was
   * called.
   *
   * Deliberately not "reach the current head": several scenarios keep the chain
   * moving while they wait, and a tool whose head latency is longer than the
   * block interval would then never once be level with the tip, however
   * healthy it was. The target is fixed at the moment of asking, which is a
   * question with an answer — and the final data check compares against the
   * chain as it finally stands anyway, so nothing is let through by it.
   */
  settle(timeoutMs: number): Promise<boolean>;

  /** Compare every row the tool holds against the canonical chain. */
  verify(): Promise<{ transfers: RowDiff; metadata: RowDiff }>;
  /** Raw rows of one entity, for a scenario that inspects values itself. */
  rows(entity: "transferEvent" | "tokenMetadata"): Promise<string[]>;

  crashes: Crash[];
  metric(name: string, value: number | string): void;
}

export interface Scenario {
  key: string;
  title: string;
  /** One line, published above the scenario's table. */
  summary: string;
  /** Chain shape this scenario needs. */
  chain?: ChainOptions;
  /** Build the chain before the tool is started. */
  setup?(chain: MockChain): void;
  run(ctx: ScenarioContext): Promise<ScenarioOutcome>;
}

export interface ScenarioResult extends ScenarioOutcome {
  scenario: string;
  tool: string;
  toolName: string;
  toolUrl: string;
  crashes: number;
  restarts: number;
  /** Slowest observed gap between a restart and the next sign of progress. */
  worstRecoveryMs: number | null;
  crashDetail: string;
  seconds: number;
}

/** How often the supervisor looks at the process, and the harness at the database. */
const POLL_MS = 250;

/** Restarts before the harness gives up on a tool for this scenario. */
const MAX_RESTARTS = 12;

/**
 * How long to wait before restarting a tool that has just died, doubling each
 * consecutive time and capped here.
 *
 * Without backoff the harness is a worse supervisor than anything anyone runs
 * in production. A tool pointed at a database that is deliberately down for ten
 * seconds dies on connect, is restarted, dies again, and burns every restart it
 * is allowed inside the outage it was supposed to be measured across — which
 * says nothing about the tool and everything about the loop. systemd and
 * Kubernetes both back off; so does this.
 */
const RESTART_BACKOFF_MS = 1_000;
const MAX_RESTART_BACKOFF_MS = 15_000;

export async function runScenario(
  tool: string,
  scenario: Scenario,
  db: PostgresServer,
  root: string
): Promise<ScenarioResult> {
  const info = TOOL_INFO[tool];
  const chain = new MockChain({ seed: `${scenario.key}:${tool}`, ...scenario.chain });
  scenario.setup?.(chain);

  const rpc = new MockRpcServer(chain);
  await rpc.listen(RPC_PORT);

  const startedAt = performance.now();
  const crashes: Crash[] = [];
  const metrics: Record<string, number | string> = {};
  let restarts = 0;
  let supervising = false;
  let watchdog: NodeJS.Timeout | null = null;
  let pendingRecovery: { crash: Crash; from: number; at: number } | null = null;
  let givenUp = false;
  /** Consecutive crashes with no progress in between, which drives the backoff. */
  let consecutiveCrashes = 0;
  /**
   * True while a crash is being handled. The watchdog fires every quarter
   * second and the handler waits out a backoff before relaunching, so without
   * this every tick during that wait sees the same dead process and records the
   * same crash again — thirteen of them inside one real crash, which is a
   * number about the polling interval rather than about the tool.
   */
  let handlingExit = false;

  const log = (message: string) => console.log(`  ${message}`);

  await db.resetDatabase(info.database);

  const driver = DRIVERS[tool]({
    dir: resolve(root, info.dir),
    rpcUrl: rpc.url,
    rpcContainerUrl: rpc.containerUrl,
    db,
    database: info.database,
    startBlock: 1,
    // Every scenario follows the head and is ended by the harness, so an exit
    // the harness did not ask for is unambiguously a crash.
    endBlock: null,
  });

  // ── Entity resolution ────────────────────────────────────────────────
  // Tables do not exist until the tool has created them, and several tools
  // create them lazily on the first write, so resolution is retried rather than
  // done once up front.
  const resolved = new Map<string, ResolvedEntity>();
  async function entity(key: string): Promise<ResolvedEntity | null> {
    const cached = resolved.get(key);
    if (cached) return cached;
    try {
      const found = await resolveEntities(driver.url, ENTITIES, driver.schemas);
      for (const [entityKey, value] of found) {
        if (typeof value !== "string") resolved.set(entityKey, value);
      }
    } catch {
      // The database may be down — that is the point of half these scenarios.
    }
    return resolved.get(key) ?? null;
  }

  async function progress(): Promise<number> {
    const transfers = await entity("transferEvent");
    if (!transfers) return -1;
    try {
      return await highestIndexedBlock(driver.url, transfers);
    } catch {
      // Unreadable right now (outage, or the table was just recreated). The
      // caller polls, so an unknown reading is not a zero reading.
      resolved.delete("transferEvent");
      return -1;
    }
  }

  // ── Supervision ──────────────────────────────────────────────────────
  async function onExit(): Promise<void> {
    const exit = driver.exit();
    if (!exit) return;
    handlingExit = true;
    try {
      await handleCrash(exit);
    } finally {
      handlingExit = false;
    }
  }

  async function handleCrash(exit: NonNullable<ReturnType<typeof driver.exit>>) {
    const crash: Crash = {
      at: exit.at,
      code: exit.code,
      signal: exit.signal,
      output: driver.output(),
      recoveredAfterMs: null,
    };
    crashes.push(crash);
    log(
      `⚠ ${info.name} exited on its own (code ${exit.code ?? "none"}, ` +
        `signal ${exit.signal ?? "none"}) — restarting`
    );
    for (const line of crash.output.slice(-4)) log(`    ${line}`);

    if (restarts >= MAX_RESTARTS) {
      givenUp = true;
      supervising = false;
      log(`✗ ${info.name} has crashed ${crashes.length} times; giving up on restarting it`);
      return;
    }
    restarts++;
    const from = await progress();
    // Back off before relaunching. Partly because a tool that has just died may
    // still be holding a listening socket, and a relaunch that failed on that
    // would be recorded as another crash of the tool's own making; mostly
    // because a tool dying on a database that is deliberately down should not
    // exhaust its restarts inside the outage.
    consecutiveCrashes++;
    await sleep(
      Math.min(
        MAX_RESTART_BACKOFF_MS,
        RESTART_BACKOFF_MS * 2 ** (consecutiveCrashes - 1)
      )
    );
    await driver.launch();
    pendingRecovery = { crash, from, at: Date.now() };
  }

  function startWatchdog() {
    if (watchdog) return;
    watchdog = setInterval(() => {
      void (async () => {
        if (supervising && !handlingExit && !driver.alive() && driver.exit()) {
          await onExit();
        }
        if (pendingRecovery && driver.alive()) {
          const now = await progress();
          if (now > pendingRecovery.from) {
            pendingRecovery.crash.recoveredAfterMs = Date.now() - pendingRecovery.at;
            pendingRecovery = null;
            // It got somewhere, so the next crash starts the backoff over.
            consecutiveCrashes = 0;
          }
        }
      })().catch(() => {});
    }, POLL_MS);
  }

  const ctx: ScenarioContext = {
    tool,
    chain,
    rpc,
    db,
    driver,
    log,
    crashes,
    metric: (name, value) => {
      metrics[name] = value;
    },
    async start() {
      await driver.launch();
      supervising = true;
      startWatchdog();
    },
    async halt(signal) {
      supervising = false;
      await driver.stop(signal);
    },
    setSupervision(enabled) {
      supervising = enabled;
    },
    async restart() {
      const wasSupervising = supervising;
      supervising = false;
      await driver.stop("SIGKILL");
      await driver.launch();
      supervising = wasSupervising;
    },
    progress,
    async waitForBlock(block, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (givenUp) return false;
        if ((await progress()) >= block) return true;
        await sleep(POLL_MS);
      }
      return false;
    },
    async settle(timeoutMs) {
      const target = chain.height;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (givenUp) return false;
        if ((await progress()) >= target) return true;
        await sleep(POLL_MS);
      }
      return false;
    },
    async rows(key) {
      const spec = await entity(key);
      if (!spec) return [];
      try {
        return await readRows(driver.url, spec);
      } catch {
        return [];
      }
    },
    async verify() {
      const expected = expectedRows(chain);
      return {
        transfers: diffRows(expected.transferEvent, await ctx.rows("transferEvent")),
        metadata: diffRows(expected.tokenMetadata, await ctx.rows("tokenMetadata")),
      };
    },
  };

  let outcome: ScenarioOutcome;
  try {
    await driver.prepare();
    outcome = await scenario.run(ctx);
  } catch (err) {
    outcome = {
      status: "error",
      detail: `the scenario could not be run: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  } finally {
    supervising = false;
    if (watchdog) clearInterval(watchdog);
    await driver.cleanup().catch(() => {});
    await rpc.close();
  }

  const recoveries = crashes
    .map((crash) => crash.recoveredAfterMs)
    .filter((ms): ms is number => ms !== null);

  return {
    ...outcome,
    metrics: { ...metrics, ...outcome.metrics },
    scenario: scenario.key,
    tool,
    toolName: info.name,
    toolUrl: info.url,
    crashes: crashes.length,
    restarts,
    worstRecoveryMs: recoveries.length > 0 ? Math.max(...recoveries) : null,
    crashDetail: describeCrashes(crashes, givenUp),
    seconds: (performance.now() - startedAt) / 1_000,
  };
}

/**
 * What the crashes were, in one line. The message the tool died with is the
 * useful half: "crashed 3 times" invites a guess, and the guess is usually
 * wrong.
 */
function describeCrashes(crashes: Crash[], givenUp: boolean): string {
  if (crashes.length === 0) return "";
  const reason = crashes[crashes.length - 1].output
    .map((line) => line.trim())
    .reverse()
    .find((line) => /error|panic|fatal|exception|failed/i.test(line));
  const times = crashes.length === 1 ? "once" : `${crashes.length} times`;
  const tail = givenUp ? ", and did not come back" : "";
  // No em-dash: published notes are split on the first one, which separates the
  // tool name from its detail.
  return reason
    ? `crashed ${times}${tail}, last with: ${trim(reason)}`
    : `crashed ${times}${tail}`;
}

const trim = (line: string, max = 160): string =>
  line.length > max ? `${line.slice(0, max - 1)}…` : line;
