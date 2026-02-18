#!/usr/bin/env node

/**
 * Script to reset the Ponder environment
 * This cleans up any previous database and temporary files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get the directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Resetting Ponder environment for Case 5...");

// Function to execute shell commands
function execCommand(command) {
  try {
    console.log(`> ${command}`);
    const result = execSync(command, { cwd: __dirname, stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Command failed: ${error.message}`);
    return false;
  }
}

// Stop any running Ponder processes
console.log("Stopping any running Ponder processes...");
execCommand('pkill -f "ponder dev" || true');

// Clean up data directory
console.log("Removing data directory...");
if (fs.existsSync(path.join(__dirname, 'data'))) {
  execCommand('rm -rf data');
}

// Create fresh data directory
console.log("Creating fresh data directory...");
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

// Clean up temporary files
console.log("Removing any temporary Ponder files...");
const files = fs.readdirSync(__dirname);
files.forEach(file => {
  if (file.startsWith('.ponder-')) {
    fs.unlinkSync(path.join(__dirname, file));
    console.log(`Removed ${file}`);
  }
});

// Create empty database file
console.log("Creating empty database file...");
fs.writeFileSync(path.join(__dirname, 'data', 'ponder.db'), '');

console.log("\nEnvironment reset complete!");
console.log("To start fresh, run: npx ponder dev --clean");
console.log("To monitor for traces, run: node monitor-traces.js"); 