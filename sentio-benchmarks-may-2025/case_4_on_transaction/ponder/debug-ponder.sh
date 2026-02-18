#!/bin/bash

# Get the PID of the currently running Ponder process
PONDER_PID=$(ps aux | grep -v grep | grep "ponder dev" | awk '{print $2}')

if [ -z "$PONDER_PID" ]; then
    echo "No Ponder process found"
    exit 1
fi

echo "Ponder process is running with PID: $PONDER_PID"

# Create output directory for logs
mkdir -p ./tmp

# Capture some basic diagnostic information
echo "Current working directory: $(pwd)"
echo "Environment variables:"
echo "DATABASE_URL: $DATABASE_URL"
echo "PONDER_RPC_URL_1: $PONDER_RPC_URL_1"

# Check if PostgreSQL is running and accessible
echo "PostgreSQL status:"
docker exec -it ponder-postgres pg_isready || echo "PostgreSQL not responding"

# Check database connectivity
echo "Testing direct database connection:"
docker exec -it ponder-postgres psql -U postgres -d ponder -c "SELECT 1 as test;"

# Wait for API to become available
echo "Checking if API is available:"
for i in {1..10}; do
    if curl -s http://localhost:42069/status > /dev/null 2>&1; then
        echo "API is now available!"
        curl -s http://localhost:42069/status
        break
    else
        echo "API not yet available (attempt $i/10)"
        sleep 3
    fi
done

echo ""
echo "Debug information collected at $(date)" 