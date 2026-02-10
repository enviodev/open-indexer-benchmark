import { ponder } from "ponder:registry";
import { swap } from "../ponder.schema";
import type { Context } from "ponder:registry";
import * as fs from "fs-extra";
import * as path from "path";
import * as parquetjs from "parquetjs";

// Ensure data directories exist
const DATA_DIR = path.join(__dirname, "..", "data");
const PARQUET_DIR = path.join(DATA_DIR, "parquet");
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(PARQUET_DIR);

// Define Parquet schema
const ParquetSchema = new parquetjs.ParquetSchema({
  id: { type: "UTF8" },
  blockNumber: { type: "INT64" },
  transactionHash: { type: "UTF8" },
  from: { type: "UTF8" },
  to: { type: "UTF8" },
  amountIn: { type: "UTF8" },
  amountOutMin: { type: "UTF8" },
  deadline: { type: "INT64" },
  path: { type: "UTF8" },
  pathLength: { type: "INT32" }
});

// Batch size for writing to Parquet
const BATCH_SIZE = 1000;
let currentBatch: any[] = [];

// Function to write swaps to Parquet file
async function writeSwapsToParquet(swaps: any[]) {
  if (swaps.length === 0) return;
  
  const filename = path.join(PARQUET_DIR, `swaps_${Date.now()}.parquet`);
  const writer = await parquetjs.ParquetWriter.openFile(ParquetSchema, filename);

    for (const swap of swaps) {
    await writer.appendRow(swap);
  }

    await writer.close();
  console.log(`Wrote ${swaps.length} swaps to ${filename}`);
}

// Log progress every N blocks
const PROGRESS_INTERVAL = 1000;
let lastLoggedBlock = 0;

function logProgress(blockNumber: bigint) {
  if (Number(blockNumber) - lastLoggedBlock >= PROGRESS_INTERVAL) {
    console.log(`Processed block ${blockNumber}`);
    lastLoggedBlock = Number(blockNumber);
  }
}

ponder.on("UniswapV2Router02.swapExactTokensForTokens()", async ({ event, context }) => {
  logProgress(event.block.number);

  const swapData = {
    id: `${event.transaction.hash}-${event.trace.traceIndex}`,
    blockNumber: event.block.number,
      transactionHash: event.transaction.hash,
    from: event.trace.from,
    to: event.trace.to,
    amountIn: event.args[0].toString(),  // amountIn (first argument)
    amountOutMin: event.args[1].toString(),  // amountOutMin (second argument)
    deadline: event.args[4],  // deadline (fifth argument)
    path: event.args[2].join(","),  // path array (third argument)
    pathLength: event.args[2].length  // Length of path array
  };

  // Save to database
  await context.db.insert(swap).values(swapData);

  // Add to batch for Parquet
  currentBatch.push(swapData);

  // Write batch if it reaches the size limit
  if (currentBatch.length >= BATCH_SIZE) {
    await writeSwapsToParquet(currentBatch);
    currentBatch = [];
  }
});