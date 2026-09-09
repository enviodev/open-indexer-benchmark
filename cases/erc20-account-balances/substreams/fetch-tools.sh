#!/usr/bin/env bash
# Fetches the two binaries this project needs into .bin/, pinned so a rerun
# measures the same tools. Both are Go releases with no package manager the
# rest of the benchmark already uses, so they are downloaded rather than
# declared as dependencies.
set -euo pipefail

SUBSTREAMS_VERSION="v1.22.0"
SINK_SQL_VERSION="v4.13.1"

cd "$(dirname "$0")"
mkdir -p .bin && cd .bin

if [ ! -x substreams ]; then
  curl -sSL "https://github.com/streamingfast/substreams/releases/download/${SUBSTREAMS_VERSION}/substreams_linux_x86_64.tar.gz" \
    | tar xz substreams
fi

if [ ! -x substreams-sink-sql ]; then
  curl -sSL "https://github.com/streamingfast/substreams-sink-sql/releases/download/${SINK_SQL_VERSION}/substreams-sink-sql_linux_x86_64.tar.gz" \
    | tar xz substreams-sink-sql
fi

./substreams --version
./substreams-sink-sql --version
