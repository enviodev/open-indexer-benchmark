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
import { DRIVERS, INDEXERS as REGISTERED } from "../cases/lib/drivers/index.ts";
import { selectScope } from "./select-scope.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = readdirSync(resolve(ROOT, "cases")).filter((d) =>
  existsSync(resolve(ROOT, "cases", d, "run.ts"))
);
const INDEXERS = [...REGISTERED];

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
  const expectFull =
    scope.cases.length === CASES.length &&
    scope.cases.every((c) => scope.indexers[c].length === INDEXERS.length);
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

check("a driver runs its indexer in every scenario", ["cases/lib/drivers/sqd.ts"], {
  "erc20-account-balances": ["sqd"],
  "erc20-transfer-events": ["sqd"],
});

check("the envio driver covers both envio variants", ["cases/lib/drivers/envio.ts"], {
  "erc20-account-balances": ["envio", "envio-rpc"],
  "erc20-transfer-events": ["envio", "envio-rpc"],
});

check("shared harness runs everything", ["cases/lib/runner.ts"], {
  "erc20-account-balances": INDEXERS,
  "erc20-transfer-events": INDEXERS,
});

check("driver plumbing runs everything", ["cases/lib/drivers/common.ts"], {
  "erc20-account-balances": INDEXERS,
  "erc20-transfer-events": INDEXERS,
});

check("workflow changes run everything", [".github/workflows/benchmark-case.yml"], {
  "erc20-account-balances": INDEXERS,
  "erc20-transfer-events": INDEXERS,
});

check("docs and local scripts run nothing", [
  "README.md",
  "cases/erc20-transfer-events/README.md",
  "cases/erc20-transfer-events/ponder/README.md",
  "scripts/test-tables.ts",
  "scripts/run-benchmarks.ts",
], {});

check("a README-suffixed file is not mistaken for docs", [
  "cases/erc20-transfer-events/ponder/NOT-README.md",
], { "erc20-transfer-events": ["ponder"] });

// These two scripts only ever execute inside the CI pipeline, so a narrowed
// run would ship a change to them to main unexercised.
check("the scope filter itself runs everything", ["scripts/select-scope.ts"], {
  "erc20-account-balances": INDEXERS,
  "erc20-transfer-events": INDEXERS,
});

check("the table builder runs everything", ["scripts/build-tables.ts"], {
  "erc20-account-balances": INDEXERS,
  "erc20-transfer-events": INDEXERS,
});

check("a file directly under cases/ is presumed shared", ["cases/helper.ts"], {
  "erc20-account-balances": INDEXERS,
  "erc20-transfer-events": INDEXERS,
});

check("selections merge across files, in canonical order", [
  "cases/erc20-transfer-events/subquery/schema.graphql",
  "cases/erc20-account-balances/ponder/ponder.config.ts",
  "cases/lib/drivers/envio.ts",
], {
  "erc20-account-balances": ["envio", "envio-rpc", "ponder"],
  "erc20-transfer-events": ["envio", "envio-rpc", "subquery"],
});

check("an unknown case directory is ignored", ["cases/erc20-approvals/run.ts"], {});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll scope tests passed");
