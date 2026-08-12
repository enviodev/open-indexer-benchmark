// Regenerates the committed ground truth (cases/<case>/expected.json) that
// indexer output is verified against.
//
//   ENVIO_API_TOKEN=... node scripts/generate-expected.ts [case...]
//
// Run this whenever a case's verification block range, contract, or handler
// logic changes. The output is small by design — a row count and a checksum
// per entity — so it can be committed and reviewed.

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCaseLogs, type CaseConfig } from "../cases/lib/case.ts";
import { summarise, type Expected } from "../cases/lib/checksum.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALL_CASES = [
  "erc20-transfer-events",
  "erc20-account-balances",
  "safe-factory-registrations",
  "erc20-allowance-calls",
];

async function loadCase(name: string): Promise<CaseConfig> {
  const mod = await import(resolve(ROOT, "cases", name, "case.config.ts"));
  return mod.caseConfig;
}

async function generate(name: string, token: string) {
  const config = await loadCase(name);
  const blocks = config.verifyEndBlock - config.startBlock + 1;
  console.log(`\n=== ${config.title} ===`);
  console.log(
    `Blocks ${config.startBlock.toLocaleString("en-US")}–${config.verifyEndBlock.toLocaleString(
      "en-US"
    )} (${blocks.toLocaleString("en-US")}) of ${[config.contract].flat().join(", ")}`
  );

  // A factory case reads the same range twice, so the pass is named: without it
  // the block number appears to jump backwards halfway through.
  let pass = "";
  const logs = await fetchCaseLogs(config, token, (progress) => {
    if (progress.pass !== pass) {
      if (pass) process.stdout.write("\n");
      pass = progress.pass;
    }
    process.stdout.write(
      `\r  ${progress.pass}: fetched to block ${progress.block.toLocaleString(
        "en-US"
      )} — ${progress.logs.toLocaleString("en-US")} logs`
    );
  });
  process.stdout.write("\n");

  if (logs.length === 0) {
    throw new Error(
      `No logs found for ${name} — check the contract address and block range`
    );
  }

  const { totalEvents, entities: rows } = config.computeExpected(logs);
  const entities = Object.fromEntries(
    Object.entries(rows).map(([key, value]) => [key, summarise(value)])
  );
  if (totalEvents !== logs.length) {
    throw new Error(
      `${name}: case logic accounted for ${totalEvents} of ${logs.length} logs — ` +
        `a topic is being fetched but not handled`
    );
  }

  // The last block that carries an event, which is as far as an indexer whose
  // progress is read from its own rows can ever appear to get.
  const lastEventBlock = logs.reduce(
    (highest, log) => (log.blockNumber > highest ? log.blockNumber : highest),
    config.startBlock
  );

  const expected: Expected = {
    startBlock: config.startBlock,
    endBlock: config.verifyEndBlock,
    generatedAt: new Date().toISOString(),
    totalEvents,
    lastEventBlock,
    entities,
  };

  const outPath = resolve(config.dir, "expected.json");
  writeFileSync(outPath, `${JSON.stringify(expected, null, 2)}\n`);

  console.log(`  ${totalEvents.toLocaleString("en-US")} events`);
  for (const [key, value] of Object.entries(entities)) {
    console.log(`  ${key}: ${value.rowCount.toLocaleString("en-US")} rows`);
  }
  console.log(`  wrote ${outPath.slice(ROOT.length + 1)}`);
}

const token = process.env.ENVIO_API_TOKEN;
if (!token) {
  console.error("Error: ENVIO_API_TOKEN environment variable is required.");
  process.exit(1);
}

const selected = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const cases = selected.length > 0 ? selected : ALL_CASES;
for (const name of cases) {
  if (!ALL_CASES.includes(name)) {
    console.error(`Unknown case "${name}". Available: ${ALL_CASES.join(", ")}`);
    process.exit(1);
  }
}

for (const name of cases) {
  await generate(name, token);
}
