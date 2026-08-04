// Tests the pull-request run filter.
//
//   node scripts/test-scope.ts
//
// The filter decides what a pull request measures. Over-selecting only costs
// runner time, but under-selecting publishes a green benchmark comment for an
// indexer nobody re-ran — so the cases that widen the scope (case run logic,
// shared driver plumbing, the workflows themselves) are the ones worth pinning.

import { existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEXERS as REGISTERED } from "../cases/lib/drivers/index.ts";
import { selectScope } from "./select-scope.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Discovered rather than listed, so a new scenario is covered the moment it
// lands instead of the day someone remembers to add it here.
const CASES = readdirSync(resolve(ROOT, "cases"))
  .filter((d) => existsSync(resolve(ROOT, "cases", d, "run.ts")))
  .sort();
const INDEXERS = [...REGISTERED];

/** The given indexers, in every scenario — what a repo-wide change selects. */
const inEvery = (indexers: string[]) =>
  Object.fromEntries(CASES.map((c) => [c, indexers]));
const EVERYTHING = inEvery(INDEXERS);

let failures = 0;

function check(name: string, changed: string[], expected: Record<string, string[]>) {
  const scope = selectScope(changed, CASES, INDEXERS);
  const actual = JSON.stringify(scope.indexers);
  const want = JSON.stringify(expected);
  if (actual !== want) {
    console.error(`FAIL ${name}\n  expected ${want}\n  actual   ${actual}`);
    failures++;
    return;
  }
  if (JSON.stringify(scope.cases) !== JSON.stringify(Object.keys(expected))) {
    console.error(`FAIL ${name} (case order)\n  cases ${JSON.stringify(scope.cases)}`);
    failures++;
    return;
  }
  // Derived from what the test expects, not from the scope under test — the
  // flag must not be allowed to grade itself.
  const expectFull =
    Object.keys(expected).length === CASES.length &&
    Object.values(expected).every((indexers) => indexers.length === INDEXERS.length);
  if (scope.full !== expectFull) {
    console.error(`FAIL ${name} (full flag)\n  expected ${expectFull}, actual ${scope.full}`);
    failures++;
    return;
  }
  console.log(`ok ${name}`);
}

// The filter carries its own copy of the indexer registry's shape — which
// directory each indexer's projects live in. If they drift, a changed indexer
// silently keeps its stale carried-forward row instead of being re-measured,
// which is the one failure mode the filter must not have. Pin the two
// together: a change in every registered indexer's project directory must
// select that indexer, in every scenario it exists in.
for (const indexer of REGISTERED) {
  for (const benchCase of CASES) {
    const dirs = readdirSync(resolve(ROOT, "cases", benchCase));
    const dir = dirs.find((d) => {
      const picked =
        selectScope([`cases/${benchCase}/${d}/x`], CASES, INDEXERS).indexers[benchCase] ?? [];
      // A proper subset, so the whole-scenario fallback for a directory the
      // filter does not recognize cannot pass for a match.
      return picked.includes(indexer) && picked.length < INDEXERS.length;
    });
    if (!dir) {
      console.error(
        `FAIL registry: no directory under cases/${benchCase}/ selects "${indexer}" — ` +
          `does select-scope.ts's INDEXER_DIRS know about it?`
      );
      failures++;
    }
  }
}
if (failures === 0) console.log(`ok registry: all ${REGISTERED.length} indexers selectable`);

// Same pin for the driver map: every registered indexer must be narrowly
// selected by some driver file that exists on disk. A driver renamed away
// from its registry key falls into the run-everything fallback — safe, but
// this keeps DRIVER_INDEXERS honest instead of letting the fallback paper
// over a stale map forever.
const driverFiles = readdirSync(resolve(ROOT, "cases", "lib", "drivers")).filter((f) =>
  f.endsWith(".ts")
);
let driverFailures = 0;
for (const indexer of REGISTERED) {
  const file = driverFiles.find((f) => {
    const picked =
      selectScope([`cases/lib/drivers/${f}`], CASES, INDEXERS).indexers[CASES[0]] ?? [];
    return picked.includes(indexer) && picked.length < INDEXERS.length;
  });
  if (!file) {
    console.error(
      `FAIL drivers: no file under cases/lib/drivers/ narrowly selects "${indexer}" — ` +
        `does select-scope.ts's DRIVER_INDEXERS know about it?`
    );
    failures++;
    driverFailures++;
  }
}
if (driverFailures === 0) console.log(`ok drivers: all ${REGISTERED.length} indexers driven`);

check("one indexer in one scenario", ["cases/erc20-transfer-events/ponder/src/index.ts"], {
  "erc20-transfer-events": ["ponder"],
});

check("envio project directory covers both envio variants", [
  "cases/erc20-transfer-events/envio/config.yaml",
], { "erc20-transfer-events": ["envio", "envio-rpc"] });

check("scenario run logic runs the whole scenario", ["cases/erc20-transfer-events/run.ts"], {
  "erc20-transfer-events": INDEXERS,
});

check("expected output runs the whole scenario", [
  "cases/erc20-account-balances/expected.json",
], { "erc20-account-balances": INDEXERS });

check("a driver runs its indexer in every scenario", ["cases/lib/drivers/sqd.ts"], inEvery(["sqd"]));

check("the envio driver covers both envio variants", ["cases/lib/drivers/envio.ts"], inEvery(["envio", "envio-rpc"]));

// Attributing a driver module to no indexer at all would select nothing and
// publish the untouched carried-forward rows as if they had been re-measured.
check("an unattributable driver module runs everything", [
  "cases/lib/drivers/helpers.ts",
], EVERYTHING);

check("shared harness runs everything", ["cases/lib/runner.ts"], EVERYTHING);

check("driver plumbing runs everything", ["cases/lib/drivers/common.ts"], EVERYTHING);

check("workflow changes run everything", [".github/workflows/benchmark-case.yml"], EVERYTHING);

check("docs and local scripts run nothing", [
  "README.md",
  "cases/erc20-transfer-events/README.md",
  "cases/erc20-transfer-events/ponder/README.md",
  ".gitignore",
  "sentio-benchmarks-may-2025/results.md",
  "scripts/test-scope.ts",
  "scripts/test-tables.ts",
  "scripts/test-verification.ts",
  "scripts/run-benchmarks.ts",
  "scripts/generate-expected.ts",
], {});

// The inert list is an allowlist, not the default: a file the filter cannot
// place — a root package.json, a new top-level directory — affects every job
// for all it knows, and selecting nothing would ship it to main unexercised.
check("an unrecognized root file runs everything", ["package.json"], EVERYTHING);

check("an unrecognized script runs everything", ["scripts/new-tool.ts"], EVERYTHING);

check("a README-suffixed file is not mistaken for docs", [
  "cases/erc20-transfer-events/ponder/NOT-README.md",
], { "erc20-transfer-events": ["ponder"] });

// These two scripts only ever execute inside the CI pipeline, so a narrowed
// run would ship a change to them to main unexercised.
check("the scope filter itself runs everything", ["scripts/select-scope.ts"], EVERYTHING);

check("the table builder runs everything", ["scripts/build-tables.ts"], EVERYTHING);

check("a file directly under cases/ is presumed shared", ["cases/helper.ts"], EVERYTHING);

check("selections merge across files, in canonical order", [
  "cases/erc20-transfer-events/subquery/schema.graphql",
  "cases/erc20-account-balances/ponder/ponder.config.ts",
  "cases/lib/drivers/envio.ts",
], {
  // The driver change reaches every scenario; the two project-directory
  // changes add one indexer each to their own.
  ...inEvery(["envio", "envio-rpc"]),
  "erc20-account-balances": ["envio", "envio-rpc", "ponder"],
  "erc20-transfer-events": ["envio", "envio-rpc", "subquery"],
});

check("an unknown case directory is ignored", ["cases/erc20-approvals/run.ts"], {});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll scope tests passed");
