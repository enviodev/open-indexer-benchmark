// Works out which scenario/indexer pairs a pull request actually needs to run.
//
//   CHANGED_FILES="$(git diff --name-only base...head)" node scripts/select-scope.ts
//
// A full run is one job per indexer per scenario — twenty-one at the time of
// writing, each up to 45 minutes against shared data endpoints, most of them
// re-measuring code the pull request never touched. On a pull request the run
// is narrowed to what changed:
//
//   cases/<case>/<indexer>/**   that indexer, in that scenario only
//   cases/<case>/<anything>     the whole scenario — the case's run logic
//                               (config, expected output) is shared by every
//                               indexer in it, so every indexer is re-measured
//   cases/lib/drivers/<x>.ts    that indexer, in every scenario
//   cases/lib/**                every indexer, every scenario
//   .github/workflows/**        every indexer, every scenario
//   this file, build-tables.ts  every indexer, every scenario — they are the
//                               CI pipeline itself, and their only execution
//                               is in it: a narrowed run would ship them to
//                               main unexercised
//
// Documentation and the known local-only scripts run nothing. Any file the
// filter does not recognize — say a root package.json that does not exist
// today — runs everything: over-running only costs runner time, while
// under-running publishes a stale row as a fresh one. Emits JSON on stdout:
//
//   {"cases":["erc20-transfer-events"],
//    "indexers":{"erc20-transfer-events":["ponder"]},
//    "full":false}
//
// `full` says nothing was narrowed away, so the summary can tell a row that
// was deliberately not re-run apart from one whose job failed.
//
// Note that `main` and workflow_dispatch runs never call this: they publish the
// README table and the table has to hold a full set of results.

/** Indexers whose project directory is not named after them. */
const INDEXER_DIRS: Record<string, string> = { "envio-rpc": "envio" };

/**
 * Driver modules under cases/lib/drivers that back more than one indexer.
 * Like INDEXER_DIRS, this duplicates a fact the drivers registry owns;
 * test-scope.ts pins both against the registry so they cannot drift silently.
 */
const DRIVER_INDEXERS: Record<string, string[]> = { envio: ["envio", "envio-rpc"] };

/** Driver modules that are shared plumbing rather than one tool's driver. */
const SHARED_DRIVERS = new Set(["common", "index"]);

/**
 * Scripts that are part of the CI pipeline itself. Nothing else executes
 * them, so a change to one has to run the pipeline in full.
 */
const PIPELINE_SCRIPTS = new Set([
  "scripts/select-scope.ts",
  "scripts/build-tables.ts",
]);

/**
 * Scripts that no benchmark job executes: the test scripts (test-scope.ts is
 * run by the setup job itself, so a change to it is exercised before it can
 * matter) and the local runners. Everything else under scripts/ is unknown
 * and runs the full matrix.
 */
const LOCAL_SCRIPTS = new Set([
  "scripts/test-scope.ts",
  "scripts/test-tables.ts",
  "scripts/test-verification.ts",
  "scripts/run-benchmarks.ts",
  "scripts/generate-expected.ts",
]);

/** True for a file that cannot change what a benchmark run measures. */
function isInert(file: string, parts: string[]): boolean {
  // Documentation never changes what a run measures, wherever it sits.
  if (parts[parts.length - 1] === "README.md") return true;
  if (file === ".gitignore" || file === "LICENSE") return true;
  // Archived third-party results, kept for reference only.
  if (parts[0] === "sentio-benchmarks-may-2025") return true;
  return LOCAL_SCRIPTS.has(file);
}

export interface Scope {
  cases: string[];
  indexers: Record<string, string[]>;
  /** True when nothing was narrowed away relative to a full run. */
  full: boolean;
}

export function selectScope(
  changedFiles: string[],
  allCases: string[],
  allIndexers: string[]
): Scope {
  const dirOf = (indexer: string) => INDEXER_DIRS[indexer] ?? indexer;
  const selected = new Map<string, Set<string>>(allCases.map((c) => [c, new Set<string>()]));

  const add = (benchCase: string, indexers: string[]) => {
    const set = selected.get(benchCase);
    if (!set) return; // A case directory the workflow does not run.
    for (const indexer of indexers) {
      if (allIndexers.includes(indexer)) set.add(indexer);
    }
  };
  const addEverywhere = (indexers: string[]) => {
    for (const benchCase of allCases) add(benchCase, indexers);
  };

  for (const raw of changedFiles) {
    const file = raw.trim();
    if (!file) continue;

    const parts = file.split("/");

    if (isInert(file, parts)) continue;

    if (file.startsWith(".github/workflows/") || PIPELINE_SCRIPTS.has(file)) {
      addEverywhere(allIndexers);
      continue;
    }

    // A file the filter cannot place — a root config file, a new top-level
    // directory — is presumed to affect every job, the failure mode that only
    // costs runner time. Selecting nothing here would ship it unexercised.
    if (parts[0] !== "cases") {
      addEverywhere(allIndexers);
      continue;
    }

    // A file directly under cases/ belongs to no scenario in particular, so
    // it is presumed shared. None exist today; running everything is the
    // failure mode that only costs runner time.
    if (parts.length === 2) {
      addEverywhere(allIndexers);
      continue;
    }

    if (parts[1] === "lib") {
      // cases/lib/drivers/<name>.ts drives one tool everywhere; everything
      // else under lib is the harness all of them run through.
      if (parts[2] === "drivers" && parts.length === 4) {
        const module = parts[3].replace(/\.ts$/, "");
        const driven = (DRIVER_INDEXERS[module] ?? [module]).filter((i) =>
          allIndexers.includes(i)
        );
        // A module under drivers/ that names no indexer this run knows about
        // is either shared plumbing or a driver whose file does not match its
        // registry key. Neither can be attributed, so it runs everything
        // rather than silently selecting nothing.
        if (!SHARED_DRIVERS.has(module) && driven.length > 0) {
          addEverywhere(driven);
          continue;
        }
      }
      addEverywhere(allIndexers);
      continue;
    }

    const benchCase = parts[1];
    // A file directly inside a project directory is that indexer's; anything
    // else in the case directory is run logic the whole scenario shares.
    const owners =
      parts.length > 3 ? allIndexers.filter((i) => dirOf(i) === parts[2]) : [];
    add(benchCase, owners.length > 0 ? owners : allIndexers);
  }

  const cases = allCases.filter((c) => (selected.get(c)?.size ?? 0) > 0);
  const indexers: Record<string, string[]> = {};
  for (const benchCase of cases) {
    // Keep the canonical order so the matrix and the table read the same way
    // however the diff happened to be ordered.
    indexers[benchCase] = allIndexers.filter((i) => selected.get(benchCase)!.has(i));
  }
  const full =
    cases.length === allCases.length &&
    cases.every((c) => indexers[c].length === allIndexers.length);
  return { cases, indexers, full };
}

if (import.meta.filename === process.argv[1]) {
  const scope = selectScope(
    (process.env.CHANGED_FILES ?? "").split("\n"),
    JSON.parse(process.env.ALL_CASES ?? "[]"),
    JSON.parse(process.env.ALL_INDEXERS ?? "[]")
  );
  console.log(JSON.stringify(scope));
}
