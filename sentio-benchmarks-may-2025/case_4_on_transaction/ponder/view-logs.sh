#!/bin/bash

# Find the Ponder process ID
PONDER_PID=$(ps aux | grep -v grep | grep "ponder dev" | awk '{print $2}' | head -n 1)

if [ -z "$PONDER_PID" ]; then
    echo "No Ponder process found. Starting a new one with trace logging..."
    cd /Users/yufeili/Desktop/sentio/indexer-benchmark/case_4_on_transaction/ponder
    npx ponder dev --log-level trace &
    PONDER_PID=$!
    sleep 3
fi

echo "Ponder process is running with PID: $PONDER_PID"

# Create a temporary log file
LOGFILE="/tmp/ponder_trace.log"
touch $LOGFILE

# Use ps to get process info and logging
echo "Process information:"
ps -p $PONDER_PID -o pid,ppid,command

# Following logs from the Ponder process if possible
if [ -d "/proc" ]; then
    # Linux
    echo "Tailing logs from /proc/$PONDER_PID/fd/1 if available..."
    if [ -e "/proc/$PONDER_PID/fd/1" ]; then
        tail -f /proc/$PONDER_PID/fd/1
    else
        echo "Unable to access stdout directly. Checking for logs..."
    fi
else
    # macOS
    echo "On macOS, we can't directly access process stdout."
    echo "Checking for any log files in the current directory..."
    ls -la *.log 2>/dev/null || echo "No log files found in current directory."
    
    echo "You can view trace logs by restarting Ponder with:"
    echo "npx ponder dev --log-level trace > ponder_trace.log 2>&1"
    
    # Try to get any recent logs from the process
    echo "Attempting to get recent logs with spindump..."
    sudo spindump $PONDER_PID 1 10 -stdout > $LOGFILE 2>/dev/null || echo "Could not get spindump (requires sudo)"
    
    if [ -s "$LOGFILE" ]; then
        echo "Process activity captured in $LOGFILE:"
        cat $LOGFILE
    fi
fi

echo "To check the status of the API, run: curl http://localhost:42069/status"
echo "To view GraphQL playground when available: http://localhost:42069/graphql" 