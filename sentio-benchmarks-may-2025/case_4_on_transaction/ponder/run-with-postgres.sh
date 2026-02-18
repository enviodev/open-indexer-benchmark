#!/bin/bash

# Kill any existing Ponder processes
echo "Stopping any existing Ponder processes..."
ps aux | grep -v grep | grep "ponder dev" | awk '{print $2}' | xargs kill 2>/dev/null || echo "No Ponder processes running"

# Create logs directory if it doesn't exist
mkdir -p logs

# Start Ponder with trace logging to a file
echo "Starting Ponder with trace logging to logs/ponder-trace.log..."

# Set the environment variables
export PONDER_RPC_URL_1="https://eth-mainnet.g.alchemy.com/v2/gcIt66S3FTL_up1cu59EMwZv1JGR7ySA"
export DATABASE_URL="postgres://postgres:postgres_password@localhost:5433/postgres"

echo "Using environment variables:"
echo "PONDER_RPC_URL_1: $PONDER_RPC_URL_1"
echo "DATABASE_URL: $DATABASE_URL"

# Run Ponder in the correct directory
cd /Users/yufeili/Desktop/sentio/indexer-benchmark/case_4_on_transaction/ponder
npx ponder dev --log-level trace > logs/ponder-trace.log 2>&1 &

# Get the PID of the Ponder process
PONDER_PID=$!
echo $PONDER_PID > logs/ponder.pid
echo "Ponder started with PID: $PONDER_PID"

# Wait a moment
sleep 5

# Check if the process is still running
if ps -p $PONDER_PID > /dev/null; then
    echo "Ponder is running. To view logs, run:"
    echo "  tail -f logs/ponder-trace.log"
    echo "To check database status:"
    echo "  docker exec -it ponder_postgres_case4 psql -U postgres -c \"\\dt\""
    echo "To check for data in the database:"
    echo "  docker exec -it ponder_postgres_case4 psql -U postgres -c \"SELECT COUNT(*) FROM gas_spent;\""
    echo "To stop Ponder, run:"
    echo "  kill \$(cat logs/ponder.pid)"
else
    echo "Ponder process failed to start. Check logs/ponder-trace.log for errors."
fi 