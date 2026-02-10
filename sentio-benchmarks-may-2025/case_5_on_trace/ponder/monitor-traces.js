/**
 * Standalone script to monitor and verify that Ponder is correctly capturing transaction traces
 * This script runs continuously and checks for traces every minute
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PONDER_SWAP_TABLE = 'swap';
const PONDER_DB_PATH = path.join(__dirname, 'data', 'ponder.db');
const LOG_FILE_PATH = path.join(__dirname, 'trace-monitor-log.txt');
const CHECK_INTERVAL = 60000; // 1 minute in milliseconds
let previousCount = 0;

// Create a clean log file
fs.writeFileSync(LOG_FILE_PATH, `Trace monitoring started at ${new Date().toISOString()}\n`);

// Helper to log to both console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
}

// Clear the console
function clearConsole() {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    process.stdout.write('\x1Bc');
  } else {
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
  }
}

// Check if the Ponder database exists
function checkDatabase() {
  if (!fs.existsSync(PONDER_DB_PATH)) {
    return { exists: false, size: 0 };
  }
  
  const stats = fs.statSync(PONDER_DB_PATH);
  const sizeInMB = stats.size / (1024 * 1024);
  return { exists: true, size: sizeInMB };
}

// Get the count of swaps in the database
function getSwapCount() {
  try {
    const command = `sqlite3 "${PONDER_DB_PATH}" "SELECT COUNT(*) FROM ${PONDER_SWAP_TABLE}"`;
    const output = execSync(command).toString().trim();
    return parseInt(output, 10);
  } catch (error) {
    return -1;
  }
}

// Get sample swaps from the database
function getSampleSwaps(limit = 5) {
  try {
    const command = `sqlite3 -json "${PONDER_DB_PATH}" "SELECT * FROM ${PONDER_SWAP_TABLE} ORDER BY blockNumber DESC LIMIT ${limit}"`;
    const output = execSync(command).toString().trim();
    return output ? JSON.parse(output) : [];
  } catch (error) {
    return [];
  }
}

// Get highest block number from the database
function getHighestBlockNumber() {
  try {
    const command = `sqlite3 "${PONDER_DB_PATH}" "SELECT MAX(blockNumber) FROM ${PONDER_SWAP_TABLE}"`;
    const output = execSync(command).toString().trim();
    return output ? parseInt(output, 10) : 0;
  } catch (error) {
    return 0;
  }
}

// Check trace capture status
function checkTraceCapture() {
  clearConsole();
  
  console.log("=".repeat(80));
  console.log("                    PONDER TRACE CAPTURE MONITOR");
  console.log("=".repeat(80));
  
  // Check if database exists
  const dbStatus = checkDatabase();
  if (!dbStatus.exists) {
    console.log("❌ Database status: Not found");
    console.log("   Waiting for Ponder to initialize and create the database...");
    return;
  }
  
  console.log(`✅ Database status: Found (${dbStatus.size.toFixed(2)} MB)`);
  
  // Get swap count
  const swapCount = getSwapCount();
  if (swapCount >= 0) {
    const newRecords = swapCount - previousCount;
    const recordsLabel = newRecords > 0 ? `+${newRecords} since last check` : "(no new records)";
    console.log(`📊 Swaps captured: ${swapCount} ${recordsLabel}`);
    previousCount = swapCount;
  } else {
    console.log("❌ Swap count: Error retrieving count");
  }
  
  // Get highest block
  const highestBlock = getHighestBlockNumber();
  if (highestBlock > 0) {
    const progress = ((highestBlock - 22200000) / 90000 * 100).toFixed(2);
    console.log(`📈 Highest block: ${highestBlock} (${progress}% complete)`);
  } else {
    console.log("❓ Highest block: Not found");
  }
  
  // Get sample swaps
  const sampleSwaps = getSampleSwaps();
  if (sampleSwaps.length > 0) {
    console.log("\n📝 Most recent swaps:");
    console.log("-".repeat(80));
    sampleSwaps.forEach((swap, index) => {
      console.log(`  ${index + 1}. Block: ${swap.blockNumber}, ID: ${swap.id}`);
      console.log(`     From: ${swap.from}, To: ${swap.to}`);
      console.log(`     Tx: ${swap.transactionHash}`);
      console.log(`     Path length: ${swap.pathLength}`);
      console.log("-".repeat(80));
    });
  } else {
    console.log("\n⚠️ No swaps found in database.");
    console.log("   This could be normal if indexing just started or if there are no traces in the blocks scanned so far.");
  }
  
  if (swapCount === 0) {
    console.log("\n❗ TROUBLESHOOTING TIPS:");
    console.log("  - Check if the RPC URL supports trace API calls");
    console.log("  - Verify includeCallTraces: true is set in ponder.config.ts");
    console.log("  - Check if the ABI contains the correct function signatures");
    console.log("  - Try running: npx ponder dev --clean to restart fresh\n");
  }
  
  console.log(`Last updated: ${new Date().toLocaleString()}`);
  console.log("=".repeat(80));
  
  // Log to file only if there are changes
  if (swapCount !== previousCount) {
    log(`Swaps captured: ${swapCount}, Highest block: ${highestBlock}`);
  }
}

// Run the check immediately
checkTraceCapture();

// Then run it every minute
console.log(`\nMonitoring started. Will check for new traces every ${CHECK_INTERVAL/1000} seconds...`);
setInterval(checkTraceCapture, CHECK_INTERVAL); 