// Writes this indexer's rows for a slot range to a JSON file, for the
// scenario's ground truth to be built from.
//
//   node snapshot.mjs <startSlot> <endSlot> <outFile>
//
// Lives in the indexer project rather than in the harness because it runs the
// project's own handlers through its own envio: the point is to capture what
// this case's documented logic produces, not to reimplement it. Reads
// ENVIO_API_TOKEN from the environment, like every other run here.

import { writeFileSync } from "node:fs";
import { createTestIndexer } from "envio";

const SOLANA = 7565164;

const [startBlock, endBlock, outFile] = process.argv.slice(2);
if (!startBlock || !endBlock || !outFile) {
  console.error("usage: node snapshot.mjs <startSlot> <endSlot> <outFile>");
  process.exit(1);
}

const indexer = createTestIndexer();
await indexer.process({
  chains: { [SOLANA]: { startBlock: Number(startBlock), endBlock: Number(endBlock) } },
});

const transfers = await indexer.Transfer.getAll();
writeFileSync(
  outFile,
  JSON.stringify(transfers, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  )
);

// The test indexer keeps handles open that would otherwise hold the process up
// long after the rows are written.
process.exit(0);
