#!/bin/bash

# Start indexer script with enhanced debugging and monitoring
echo "Starting Ponder Case 5 indexer with trace tracking..."

# Set environment variable to increase logging
export PONDER_LOG_LEVEL=debug

# Backup any previous logs
if [ -f ponder.log ]; then
    timestamp=$(date +"%Y%m%d_%H%M%S")
    mv ponder.log "ponder_backup_${timestamp}.log"
    echo "Previous log backed up to ponder_backup_${timestamp}.log"
fi

# Clean any temporary files that might interfere
echo "Cleaning temporary files..."
rm -f .ponder-*

# Start Ponder with logs redirected to file and terminal
echo "Starting Ponder dev environment with enhanced monitoring..."
npx ponder dev > ponder.log 2>&1 &
PONDER_PID=$!
echo "Ponder started with PID: $PONDER_PID"

# Set up periodic trace checking
echo "Setting up periodic trace checking..."
rm -f trace-capture-log.txt

# Function to check for traces
check_traces() {
    echo "Checking for traces..."
    node check-trace-capture.js
}

# Initial delay to give Ponder time to start up
echo "Waiting for Ponder to initialize..."
sleep 30

# Initial trace check
check_traces

# Set up periodic checks every 5 minutes
echo "Setting up periodic trace checks every 5 minutes..."
while true; do
    sleep 300  # 5 minutes
    check_traces
done 