#!/bin/bash

echo "Checking Ponder indexing progress..."

# Check if Ponder is running
PONDER_PID=$(ps aux | grep -v grep | grep "ponder dev" | awk '{print $2}')
if [ -z "$PONDER_PID" ]; then
    echo "Ponder is not running. Starting it..."
    cd /Users/yufeili/Desktop/sentio/indexer-benchmark/case_4_on_transaction/ponder
    npm run dev &
    sleep 5
    PONDER_PID=$(ps aux | grep -v grep | grep "ponder dev" | awk '{print $2}')
fi

echo "Ponder is running with PID: $PONDER_PID"

# Check if API is available
API_STATUS=$(curl -s http://localhost:42069/status 2>/dev/null || echo "API not yet available")
if [ "$API_STATUS" == "API not yet available" ]; then
    echo "Ponder API is not yet available. Indexing may still be in progress."
else
    echo "Ponder API is available. Checking indexing status..."
    echo "$API_STATUS"
fi

# Check the PostgreSQL database for indexed data
echo "Checking PostgreSQL database for indexed data..."
RECORD_COUNT=$(docker exec -it ponder-postgres psql -U postgres -d ponder -t -c "SELECT COUNT(*) FROM gas_spent;" 2>/dev/null || echo "0")
echo "Current record count in gas_spent table: $RECORD_COUNT"

echo "Done." 