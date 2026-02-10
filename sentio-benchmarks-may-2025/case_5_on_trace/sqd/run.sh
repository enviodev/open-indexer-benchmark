#!/bin/bash
echo "Building Subsquid indexer..."
sqd build

echo "Starting the database..."
sqd up

echo "Applying migrations..."
sqd migration:apply

echo "Running Subsquid processor with increased memory..."
NODE_OPTIONS="--expose-gc --max-old-space-size=4096" sqd process 