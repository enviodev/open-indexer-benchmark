#!/bin/bash

# Kill any existing Ponder processes
echo "Stopping any existing Ponder processes..."
ps aux | grep -v grep | grep "ponder dev" | awk '{print $2}' | xargs kill 2>/dev/null || echo "No Ponder processes running"

# Set environment variables
export PONDER_RPC_URL_1="https://eth-mainnet.g.alchemy.com/v2/gcIt66S3FTL_up1cu59EMwZv1JGR7ySA"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ponder"

echo "Starting Ponder with environment variables:"
echo "PONDER_RPC_URL_1=$PONDER_RPC_URL_1"
echo "DATABASE_URL=$DATABASE_URL"

# Start Ponder in development mode
echo "Starting Ponder..."
npm run dev 