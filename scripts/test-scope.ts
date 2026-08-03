// Tests the pull-request run filter.
//
//   node scripts/test-scope.ts
//
// The filter decides what a pull request measures. Over-selecting only costs
// runner time, but under-selecting publishes a green benchmark comment for an
// indexer nobody re-ran — so the cases that widen the scope (case run logic,
// shared driver plumbing, the workflows themselves) are the ones worth pinning.

import { selectScope } from "./select-scope.ts";

const CASES = ["erc20-account-balances", "erc20-transfer-events"];
const INDEXERS = ["envio", "envio-rpc", "ponder", "rindexer", "subgraph", "subquery", "sqd"];

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
  console.log(`ok ${name}`);
}

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

check("docs run nothing", [
  "README.md",
  "cases/erc20-transfer-events/README.md",
  "cases/erc20-transfer-events/ponder/README.md",
  "scripts/build-tables.ts",
], {});

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
