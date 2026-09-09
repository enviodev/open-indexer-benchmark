#!/usr/bin/env bash
# Fetches the two binaries this project needs into .bin/, pinned so a rerun
# measures the same tools. Both are Go releases with no package manager the
# rest of the benchmark already uses, so they are downloaded rather than
# declared as dependencies.
set -euo pipefail

SUBSTREAMS_VERSION="v1.22.0"
SINK_SQL_VERSION="v4.13.1"

# A tag names a release, not its bytes: a release asset can be replaced under
# the same tag, and these archives are extracted and then run. The hashes are
# each release's own checksums.txt entry for the Linux x86_64 archive.
SUBSTREAMS_SHA256="6eef6182d8d9e3c0147a3d03f38fc2b9c0f96900d040132294a0b540e691ae67"
SINK_SQL_SHA256="425e5dbaf1998d4086597820270dab113faa10af56a146730367f4374fb9bb13"

cd "$(dirname "$0")"
mkdir -p .bin && cd .bin

# Downloaded to a file rather than piped into tar: a stream cannot be checked
# before it is extracted.
fetch() {
  local url="$1" sha="$2" binary="$3" archive
  archive="$(mktemp)"
  trap 'rm -f "$archive"' RETURN
  curl -sSL "$url" -o "$archive"
  echo "${sha}  ${archive}" | sha256sum -c - >/dev/null
  tar xz -f "$archive" "$binary"
}

if [ ! -x substreams ]; then
  fetch "https://github.com/streamingfast/substreams/releases/download/${SUBSTREAMS_VERSION}/substreams_linux_x86_64.tar.gz" \
    "$SUBSTREAMS_SHA256" substreams
fi

if [ ! -x substreams-sink-sql ]; then
  fetch "https://github.com/streamingfast/substreams-sink-sql/releases/download/${SINK_SQL_VERSION}/substreams-sink-sql_linux_x86_64.tar.gz" \
    "$SINK_SQL_SHA256" substreams-sink-sql
fi

./substreams --version
./substreams-sink-sql --version
