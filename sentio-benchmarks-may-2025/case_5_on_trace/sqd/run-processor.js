#!/usr/bin/env node

// This file is a wrapper to run the processor with garbage collection enabled
// It must be run with: node --expose-gc run-processor.js

// Check if garbage collection is exposed
if (!global.gc) {
  console.error('This script must be run with --expose-gc flag');
  console.error('Run with: node --expose-gc run-processor.js');
  process.exit(1);
}

// Import the compiled processor module
require('./lib/main.js'); 