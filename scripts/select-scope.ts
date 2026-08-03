// Works out which scenario/indexer pairs a pull request actually needs to run.
//
//   CHANGED_FILES="$(git diff --name-only base...head)" node scripts/select-scope.ts
//
// A full run is fourteen jobs of up to 45 minutes against shared data
// endpoints, most of them re-measuring code the pull request never touched. On
// a pull request the run is narrowed to what changed:
//
//   cases/<case>/<indexer>/**   that indexer, in that scenario only
//   cases/<case>/<anything>     the whole scenario — the case's run logic
//                               (config, expected output) is shared by every
//                               indexer in it, so every indexer is re-measured
//   cases/lib/drivers/<x>.ts    that indexer, in every scenario
//   cases/lib/**                every indexer, every scenario
//   .github/workflows/**        every indexer, every scenario
//
// Anything else — docs, local scripts — runs nothing. Emits JSON on stdout:
//
//   {"cases":["erc20-transfer-events"],
//    "indexers":{"erc20-transfer-events":["ponder"]}}
//
// Note that `main` and workflow_dispatch runs never call this: they publish the
// README table and the table has to hold a full set of results.

/** Indexers whose project directory is not named after them. */
const INDEXER_DIRS: Record<string, string> = { "envio-rpc": "envio" };

/** Driver modules under cases/lib/drivers that back more than one indexer. */
const DRIVER_INDEXERS: Record<string, string[]> = { envio: ["envio", "envio-rpc"] };

/** Driver modules that are shared plumbing rather than one tool's driver. */
const SHARED_DRIVERS = new Set(["common", "index"]);

export interface Scope {
  cases: string[];
  indexers: Record<string, string[]>;
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

    // Documentation never changes what a run measures, wherever it sits.
    if (file.endsWith("README.md")) continue;

    if (file.startsWith(".github/workflows/")) {
      addEverywhere(allIndexers);
      continue;
    }

    const parts = file.split("/");
    if (parts[0] !== "cases" || parts.length < 3) continue;

    if (parts[1] === "lib") {
      // cases/lib/drivers/<name>.ts drives one tool everywhere; everything
      // else under lib is the harness all of them run through.
      if (parts[2] === "drivers" && parts.length === 4) {
        const module = parts[3].replace(/\.ts$/, "");
        if (!SHARED_DRIVERS.has(module)) {
          addEverywhere(DRIVER_INDEXERS[module] ?? [module]);
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
  return { cases, indexers };
}

if (import.meta.filename === process.argv[1]) {
  const scope = selectScope(
    (process.env.CHANGED_FILES ?? "").split("\n"),
    JSON.parse(process.env.ALL_CASES ?? "[]"),
    JSON.parse(process.env.ALL_INDEXERS ?? "[]")
  );
  console.log(JSON.stringify(scope));
}
