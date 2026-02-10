/**
 * Script to verify that Ponder is correctly capturing transaction traces
 * Run this script occasionally while indexing is in progress
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PONDER_SWAP_TABLE = 'swap';
const PONDER_DB_PATH = path.join(__dirname, 'data', 'ponder.db');
const LOG_FILE_PATH = path.join(__dirname, 'trace-capture-log.txt');

// Helper to log to both console and file
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE_PATH, logMessage + '\n');
}

// Check if the Ponder database exists
function checkDatabase() {
  if (!fs.existsSync(PONDER_DB_PATH)) {
    log(`⚠️ Ponder database not found at: ${PONDER_DB_PATH}`);
    return false;
  }
  
  const stats = fs.statSync(PONDER_DB_PATH);
  const sizeInMB = stats.size / (1024 * 1024);
  log(`✅ Ponder database found: ${PONDER_DB_PATH} (${sizeInMB.toFixed(2)} MB)`);
  return true;
}

// Get the count of swaps in the database
function getSwapCount() {
  try {
    // Execute SQLite query to count rows
    const command = `sqlite3 "${PONDER_DB_PATH}" "SELECT COUNT(*) FROM ${PONDER_SWAP_TABLE}"`;
    const output = execSync(command).toString().trim();
    return parseInt(output, 10);
  } catch (error) {
    log(`❌ Error counting swaps: ${error.message}`);
    return -1;
  }
}

// Get sample swaps from the database
function getSampleSwaps(limit = 5) {
  try {
    // Execute SQLite query to get sample swaps
    const command = `sqlite3 -json "${PONDER_DB_PATH}" "SELECT * FROM ${PONDER_SWAP_TABLE} LIMIT ${limit}"`;
    const output = execSync(command).toString().trim();
    return JSON.parse(output);
  } catch (error) {
    log(`❌ Error getting sample swaps: ${error.message}`);
    return [];
  }
}

// Check trace capture status
function checkTraceCapture() {
  log('🔍 Checking trace capture status...');
  
  // Check if database exists
  if (!checkDatabase()) {
    return;
  }
  
  // Get swap count
  const swapCount = getSwapCount();
  if (swapCount >= 0) {
    log(`📊 Total swaps captured: ${swapCount}`);
  }
  
  // Get sample swaps
  const sampleSwaps = getSampleSwaps();
  if (sampleSwaps.length > 0) {
    log(`📝 Sample swaps (${sampleSwaps.length}):`);
    sampleSwaps.forEach((swap, index) => {
      log(`  ${index + 1}. ID: ${swap.id}, Block: ${swap.blockNumber}, Tx: ${swap.transactionHash.slice(0, 10)}...`);
    });
  } else {
    log('⚠️ No sample swaps found. Trace capture may not be working correctly.');
  }
  
  // Check for potential indexing issues
  if (swapCount === 0) {
    log('❗ No swaps captured! Possible issues:');
    log('  - Check if the RPC URL in .env has trace support');
    log('  - Verify that includeCallTraces: true is set in ponder.config.ts');
    log('  - Make sure the correct block range is specified');
    log('  - Check if the contract ABI has the correct function signatures');
  }
}

// Run the check
checkTraceCapture(); 