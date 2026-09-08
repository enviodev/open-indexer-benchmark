// Which indexers each scenario actually implements.
//
//   ALL_CASES='["erc20-transfer-events"]' ALL_INDEXERS='["envio"]' \
//     node scripts/case-indexers.ts
//
// A scenario runs a tool if it has a project directory for it and the case
// does not declare it unsupported. Every EVM scenario implements every tool,
// so this changes nothing there — but Solana is indexed by a handful of them,
// and a job for a tool with nothing to run is a red X that means "not written
// yet", which is not a benchmark result.
//
// Directory-driven rather than declared, so adding cases/<case>/<tool>/ is all
// it takes to put that tool in the scenario's matrix and its table.

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEXER_DIRS } from "./select-scope.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The given indexers, less those the scenario has no project for and those it
 * declares unsupported.
 */
export async function caseIndexers(
  benchCase: string,
  indexers: string[]
): Promise<string[]> {
  const config = await import(resolve(ROOT, "cases", benchCase, "case.config.ts"));
  const unsupported: Record<string, string> = config.caseConfig?.unsupported ?? {};
  return indexers.filter(
    (indexer) =>
      !(indexer in unsupported) &&
      existsSync(resolve(ROOT, "cases", benchCase, INDEXER_DIRS[indexer] ?? indexer))
  );
}

if (import.meta.filename === process.argv[1]) {
  const cases: string[] = JSON.parse(process.env.ALL_CASES ?? "[]");
  const indexers: string[] = JSON.parse(process.env.ALL_INDEXERS ?? "[]");
  const entries = await Promise.all(
    cases.map(async (c) => [c, await caseIndexers(c, indexers)] as const)
  );
  console.log(JSON.stringify(Object.fromEntries(entries)));
}
