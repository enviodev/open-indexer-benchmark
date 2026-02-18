#!/bin/bash

# Create output directory for logs
mkdir -p ./tmp
OUTPUT_DIR="./tmp"
LOG_FILE="${OUTPUT_DIR}/test.log"

# Clean up any previous runs
echo "Cleaning up previous runs..."
rm -f ${LOG_FILE}

# Use existing PostgreSQL container
POSTGRES_CONTAINER="ponder-postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_PORT="5432"

echo "Checking if PostgreSQL container is already running..."
if [ ! "$(docker ps -q -f name=${POSTGRES_CONTAINER})" ]; then
    echo "PostgreSQL container is not running. Starting it..."
    docker-compose up -d
    
    # Wait for PostgreSQL to start
    echo "Waiting for PostgreSQL to start..."
    sleep 5
fi

# Setup environment variables
echo "Setting up environment variables..."
export PONDER_RPC_URL_1="https://eth-mainnet.g.alchemy.com/v2/gcIt66S3FTL_up1cu59EMwZv1JGR7ySA"
export DATABASE_URL="postgres://postgres:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/ponder"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start Ponder indexer
echo "Starting Ponder indexer..."
echo "Using DATABASE_URL: ${DATABASE_URL}"
echo "Using PONDER_RPC_URL_1: ${PONDER_RPC_URL_1}"

npm run dev > ${LOG_FILE} 2>&1 &
PONDER_PID=$!

echo "Ponder indexer started with PID: ${PONDER_PID}"

# Wait for indexing to complete or timeout
MAX_WAIT_SECONDS=3600 # 1 hour max
WAIT_INTERVAL=30 # Check every 30 seconds
ELAPSED=0

echo "Monitoring indexing progress..."
while [ ${ELAPSED} -lt ${MAX_WAIT_SECONDS} ]; do
    # Check if process is still running
    if ! ps -p ${PONDER_PID} > /dev/null; then
        echo "Ponder process has exited unexpectedly. Check logs."
        break
    fi
    
    # Check for success in logs
    if grep -q "historical (100%)" ${LOG_FILE}; then
        echo "Indexing complete!"
        break
    fi
    
    # Check for errors
    if grep -q "Error" ${LOG_FILE}; then
        echo "Errors detected in logs. Check ${LOG_FILE} for details."
    fi
    
    echo "Indexing in progress... (${ELAPSED}s elapsed)"
    sleep ${WAIT_INTERVAL}
    ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

# Verify data was indexed
echo "Querying data to verify indexing..."
curl -s -X POST http://localhost:42069/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ gasSpents { items { id blockNumber transactionHash from to gasValue } } }"}' | tee ${OUTPUT_DIR}/query-result.json

# Gracefully stop Ponder
echo "Stopping Ponder indexer..."
kill ${PONDER_PID}
sleep 5

echo "Test completed. Logs available at: ${LOG_FILE}"

# Keep PostgreSQL running for further testing
echo "PostgreSQL container '${POSTGRES_CONTAINER}' is still running on port ${POSTGRES_PORT}."
echo "To stop it, run: docker stop ${POSTGRES_CONTAINER} && docker rm ${POSTGRES_CONTAINER}" 