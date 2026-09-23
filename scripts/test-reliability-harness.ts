// Tests the reliability harness by running it against indexers whose behaviour
// is known.
//
//   RELIABILITY_TEST_DB=postgresql://postgres@127.0.0.1:5432/postgres \
//     node scripts/test-reliability-harness.ts [--full]
//
// Every published reliability score is a claim that the harness would have
// noticed something. Nothing else in this repository can check that claim: the
// scenarios' own verdicts are what is under test, so a run against a real
// indexer tells you what that indexer did, not whether the harness can tell.
//
// So this drives the whole harness - the generated chain, the scenario bodies,
// the schema resolution, the SQL, the comparison against the chain - against a
// deliberately simple indexer that can be given specific defects. A correct
// indexer has to pass; an indexer with a defect has to fail the check that
// defect is about, and that is what is asserted. Both directions matter: a
// harness that fails everything is as useless as one that passes everything.
//
// It needs a PostgreSQL it may create databases on, and no other credentials:
// the chain is generated and the indexer is in this repository. Docker is not
// needed, because the one scenario that takes a database away is given a
// stand-in that takes this one away instead - by refusing its connections,
// which is the same thing as far as the indexer connected to it is concerned.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const ADMIN = process.env.RELIABILITY_TEST_DB ?? "postgresql://postgres@127.0.0.1:5432/postgres";
const FULL = process.argv.includes("--full");
/** Narrows the run to expectations whose label contains this, while iterating. */
const ONLY = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);

const { runOnce, mergeCheck, median } = await import("../reliability/lib/runner.ts");
const { fakeIndexer } = await import("../reliability/lib/fake-indexer.ts");
const { SCENARIOS } = await import("../reliability/lib/scenarios.ts");
const { PLAYS } = await import("../reliability/lib/play.ts");
const { sleep } = await import("../cases/lib/process.ts");

/**
 * How long this test waits, against the suite's own minutes.
 *
 * The indexer it drives answers in milliseconds, so the published patience
 * would mean waiting three minutes to conclude that a deliberate defect is a
 * defect. Passed explicitly rather than set in the environment: a published
 * run reads neither of these.
 */
const PATIENCE = { syncMs: 30_000, reactMs: 15_000 };
type Outcome = import("../reliability/lib/score.ts").Outcome;
type Defect = import("../reliability/lib/fake-indexer.ts").Defect;

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`ok ${name}`);
    return;
  }
  console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ""}`);
  failures++;
}

const psqlAdmin = (query: string) => run("psql", [ADMIN, "-t", "-A", "-c", query]);

/**
 * The role the double connects as.
 *
 * Deliberately not a superuser. PostgreSQL does not enforce a database's
 * connection limit against superusers, so an "outage" staged by setting that
 * limit to zero would let a superuser straight through - which is exactly what
 * happened here, and it scored an indexer that exits on its first failed query
 * as having survived one. An ordinary role is refused, which is the point.
 */
const ROLE = "relharness";

async function ensureRole() {
  await psqlAdmin(
    `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') ` +
      `THEN CREATE ROLE ${ROLE} LOGIN PASSWORD '${ROLE}'; END IF; END $$`
  );
}

async function freshDatabase(name: string): Promise<string> {
  await psqlAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await psqlAdmin(`CREATE DATABASE ${name} OWNER ${ROLE}`);
  const url = new URL(ADMIN);
  url.pathname = `/${name}`;
  url.username = ROLE;
  url.password = ROLE;
  return url.toString();
}

/**
 * Takes the database away from whatever is connected to it, without a
 * container: refuse new connections and drop the ones that exist. An indexer
 * holding a pool sees exactly what it sees when Postgres restarts - its
 * queries fail, and keep failing, until they do not.
 */
function connectionOutage(name: string) {
  return async (_dbUrl: string, downMs: number) => {
    await psqlAdmin(`ALTER DATABASE ${name} CONNECTION LIMIT 0`);
    await psqlAdmin(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}'`
    );
    await sleep(downMs);
    await psqlAdmin(`ALTER DATABASE ${name} CONNECTION LIMIT -1`);
    return { downMs, container: `${name} (connections refused)` };
  };
}

/**
 * Makes every write hang, without a container.
 *
 * The real thing is `docker pause`: the connections stay open and nothing
 * sent on them is answered. An exclusive lock on the tables the indexer
 * writes is the same experience from where the indexer is sitting - its
 * statement blocks, no error is raised, and it waits. Which is what the check
 * is about: whether a tool that is given silence rather than an error ever
 * comes back by itself.
 */
function frozenTables(dbUrl: string) {
  return async (_dbUrl: string, downMs: number) => {
    const seconds = Math.ceil(downMs / 1_000);
    await run("psql", [
      dbUrl,
      "-c",
      `BEGIN; LOCK TABLE transfer, account IN ACCESS EXCLUSIVE MODE; ` +
        `SELECT pg_sleep(${seconds}); COMMIT`,
    ]);
    return { downMs, container: `${dbUrl.split("/").pop()} (writes frozen)` };
  };
}

const status = (outcome: Outcome | undefined) => outcome?.status ?? "missing";
const detailOf = (outcome: Outcome | undefined) =>
  outcome && outcome.status !== "pass" ? outcome.detail : "";

interface Expectation {
  scenario: string;
  defects?: Defect[];
  /**
   * Blocks per batch for the double. A defect that only shows when a kill
   * lands mid-commit needs the double to commit often, or the scenario is
   * relying on hitting a window that is a fraction of one run in a hundred.
   * A real indexer batches far more finely than the default here.
   */
  batchBlocks?: number;
  /** Checks that must pass. */
  passes?: string[];
  /** Checks that must fail - the defect's fingerprint. */
  fails?: string[];
  /** Checks that must come back unmeasured rather than failed. */
  unmeasured?: string[];
  /** Restart the database by refusing its connections instead of a container. */
  outage?: boolean;
  slow?: boolean;
}

const EXPECTATIONS: Expectation[] = [
  // ── A correct indexer passes ──
  {
    scenario: "reorg-cases",
    passes: [
      "shallow",
      "shortening",
      "removes-event",
      "while-down",
      "storm",
      "deep",
      "during-backfill",
    ],
  },
  {
    scenario: "awkward-values",
    passes: [
      "null-symbol",
      "nul-byte",
      "huge-log-index",
      "max-uint",
      "empty-blocks",
      "second-event",
    ],
  },
  // A tool that indexes the transfers and ignores the other event it is
  // configured for: every other check in the scenario passes, which is what
  // makes this one worth having.
  {
    scenario: "awkward-values",
    defects: ["drops-second-event"],
    fails: ["second-event"],
    passes: ["max-uint", "empty-blocks"],
  },
  { scenario: "process-kill", passes: ["resumes", "no-gap", "no-double-apply", "atomic-batch"] },
  { scenario: "graceful-shutdown", passes: ["exits-clean", "flushes"] },
  // The same, stopped halfway through the range - which is where every real
  // tool slower than this double is when the signal lands. Committing five
  // blocks at a time is what keeps it there. Without this case the check was
  // only ever put to a tool that had already finished, and it marked down
  // every tool that had not: the unfinished half of the range read as wrong
  // balances, and whether a tool passed was decided by how fast it was.
  {
    scenario: "graceful-shutdown",
    batchBlocks: 5,
    passes: ["exits-clean", "flushes"],
  },
  // And a tool that does leave bad state behind still fails it: every
  // transfer right, and the last batch's balance changes applied twice on
  // the way out. Stopped mid-range too, so the horizon the check now uses
  // is the thing under test.
  {
    scenario: "graceful-shutdown",
    batchBlocks: 5,
    defects: ["double-flush-on-stop"],
    passes: ["exits-clean"],
    fails: ["flushes"],
  },
  { scenario: "rpc-limits", passes: ["splits-range", "splits-results"] },
  // Never run here until every tool but one failed its last check: this
  // double, like Envio, notices a rewrite when the next block arrives, and
  // the scenario rewrote the head and then stood still.
  {
    scenario: "block-to-row",
    passes: ["median-under-block-time", "tail-bounded", "keeps-up", "recovers-after-reorg"],
    slow: true,
  },
  {
    scenario: "db-restart",
    outage: true,
    passes: ["recovers-backfill", "recovers-pause", "no-loss", "no-duplicates"],
  },
  {
    scenario: "rpc-inconsistency",
    passes: ["head-goes-backwards", "duplicate-delivery", "stale-hash", "missing-block"],
    slow: true,
  },
  {
    scenario: "rpc-chaos",
    passes: ["survives", "catches-up", "no-loss", "no-duplicates"],
    slow: true,
  },
  { scenario: "rpc-outage", passes: ["survives", "resumes", "no-loss", "backs-off"], slow: true },

  // ── And a defective one fails the check its defect is about ──
  {
    scenario: "reorg-cases",
    defects: ["no-reorg-handling"],
    fails: ["shallow", "shortening", "removes-event", "while-down"],
  },
  {
    scenario: "process-kill",
    defects: ["checkpoint-ahead"],
    batchBlocks: 25,
    fails: ["no-gap"],
  },
  // Held against a fresh start, so it is the narrowing that fails, not
  // however the tool happens to follow the head.
  {
    scenario: "process-kill",
    defects: ["double-apply"],
    fails: ["no-double-apply"],
  },
  // A tool that exits and comes back with the right data is not marked down
  // for exiting - the restart is published as a measure instead - so the
  // defect that fails this check is the one a restart does not fix.
  {
    scenario: "db-restart",
    defects: ["stuck-after-db-error"],
    outage: true,
    fails: ["recovers-backfill"],
  },
  {
    scenario: "db-restart",
    defects: ["die-on-db-error"],
    outage: true,
    passes: ["recovers-backfill"],
  },

  // ── A project that cannot implement an entity loses only its checks ──
  //
  // No-code rindexer has no facility for reading contract state, so its
  // project has no token row and never will. The two checks that read one have
  // to come back unmeasured - and, more importantly, the other three have to
  // still be asked: a resolver that gave up on the whole schema over one
  // missing table would turn a project with a documented limit into an indexer
  // whose tables cannot be read at all.
  {
    scenario: "awkward-values",
    defects: ["no-token-table"],
    unmeasured: ["null-symbol", "nul-byte"],
    passes: ["huge-log-index", "max-uint", "empty-blocks"],
  },

  // ── And a gap in the benchmark is never a finding about the tool ──
  //
  // Both defects at once: an indexer that would genuinely fail every reorg
  // check, and that also asks for a method the generated chain does not serve.
  // The second has to win. A mock that refuses a method an indexer needs will
  // fail it at everything, and publishing that as "no reorg handling" would be
  // this benchmark accusing somebody else's software of its own shortcoming.
  {
    scenario: "reorg-cases",
    defects: ["no-reorg-handling", "asks-for-an-unserved-method"],
    unmeasured: ["shallow", "removes-event", "while-down"],
  },
];

await ensureRole();

let index = 0;
for (const expectation of EXPECTATIONS) {
  if (expectation.slow && !FULL) {
    console.log(`skip ${expectation.scenario} (slow; pass --full to run it)`);
    continue;
  }
  const label =
    `${expectation.scenario}` +
    (expectation.defects ? ` with ${expectation.defects.join(", ")}` : " (correct indexer)");
  if (ONLY && !label.includes(ONLY)) continue;
  const name = `relharness_${index++}`;
  const dbUrl = await freshDatabase(name);
  const startedAt = Date.now();
  const result = await runOnce(
    "fake",
    fakeIndexer({
      dbUrl,
      defects: expectation.defects,
      batchBlocks: expectation.batchBlocks,
    }),
    expectation.scenario,
    1,
    () => {},
    expectation.outage ? connectionOutage(name) : undefined,
    PATIENCE,
    expectation.outage ? frozenTables(dbUrl) : undefined
  );
  const seconds = ((Date.now() - startedAt) / 1_000).toFixed(0);

  for (const id of expectation.passes ?? []) {
    check(
      `${label}: ${id} passes`,
      status(result.checks[id]) === "pass",
      `${status(result.checks[id])} - ${detailOf(result.checks[id])} (${seconds}s)`
    );
  }
  for (const id of expectation.unmeasured ?? []) {
    check(
      `${label}: ${id} is unmeasured, not failed`,
      status(result.checks[id]) === "na",
      `the harness reported ${status(result.checks[id])} for a scenario the chain ` +
        `could not fully serve (${seconds}s)`
    );
  }
  for (const id of expectation.fails ?? []) {
    check(
      `${label}: ${id} is caught`,
      status(result.checks[id]) === "fail",
      `the harness reported ${status(result.checks[id])} for a defect it should catch ` +
        `(${seconds}s)`
    );
  }
  await psqlAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
}

// ── The catalog and the implementations describe the same suite ──

check(
  "every scenario in the catalog has an implementation",
  SCENARIOS.every((scenario) => PLAYS[scenario.id]),
  SCENARIOS.filter((s) => !PLAYS[s.id]).map((s) => s.id).join(", ")
);
check(
  "every implementation has a catalog entry",
  Object.keys(PLAYS).every((id) => SCENARIOS.some((scenario) => scenario.id === id)),
  Object.keys(PLAYS).filter((id) => !SCENARIOS.some((s) => s.id === id)).join(", ")
);

// ── Merging repeats ──
//
// The rule that makes a repeat worth running: a check that failed once is a
// failed check, however many times it passed.

check(
  "a check that passed every run passes",
  mergeCheck([{ status: "pass" }, { status: "pass" }]).status === "pass"
);
{
  const merged = mergeCheck([
    { status: "pass" },
    { status: "fail", detail: "lost a batch" },
    { status: "pass" },
  ]);
  check(
    "a check that failed once fails, and says how often",
    merged.status === "fail" && /failed 1 of 3 runs/.test((merged as { detail: string }).detail),
    JSON.stringify(merged)
  );
}
{
  const merged = mergeCheck([
    { status: "fail", detail: "lost a batch" },
    { status: "fail", detail: "lost a batch" },
  ]);
  check(
    "a check that failed every run does not count them",
    merged.status === "fail" && !/failed 2 of 2/.test((merged as { detail: string }).detail),
    JSON.stringify(merged)
  );
}
check(
  "a check no run could ask stays unmeasured",
  mergeCheck([
    { status: "na", detail: "no container" },
    { status: "na", detail: "no container" },
  ]).status === "na"
);
check(
  "a run that could not ask does not outvote one that could",
  mergeCheck([{ status: "na", detail: "not measured" }, { status: "pass" }]).status === "pass"
);
check("the median of three readings is the middle one", median([10, 100, 20]) === 20);
check("and of four, the average of the middle two", median([10, 20, 30, 41]) === 25);

console.log(
  failures === 0
    ? `\nAll harness tests passed${FULL ? "" : " (slow scenarios skipped; --full runs them)"}.`
    : `\n${failures} failure(s).`
);
process.exit(failures === 0 ? 0 : 1);
