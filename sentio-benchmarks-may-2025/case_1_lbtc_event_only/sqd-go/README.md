# sqd-go Implementation - LBTC Event Only Benchmark

This directory contains an [sqd-go](https://github.com/subsquid-labs/sqd-go)
implementation for indexing LBTC token transfer events. sqd-go is a Go
EVM-to-ClickHouse indexer that reads from the SQD Portal — no RPC endpoint is
used for this case.

This is `config.yaml` only; sqd-go itself is a separate checkout (sibling
repo, not vendored here). `../run.ts` builds and drives it directly.

## Prerequisites

- A checkout of [sqd-go](https://github.com/subsquid-labs/sqd-go) as a sibling
  directory (`../../../../sqd-go` from this file, i.e. next to
  `open-indexer-benchmark/`). Override the path with `SQD_GO_DIR` if it lives
  elsewhere.
- Go (see sqd-go's `go.mod` for the required version)
- Docker (for the local ClickHouse instance sqd-go ships in its own
  `compose.yml`)
- An SQD Portal API key from [portal.sqd.dev](https://portal.sqd.dev)

## Setup

```bash
cp .env.example .env   # then set SQD_API_TOKEN
```

## Running

Use the case-level runner, which builds sqd-go, starts ClickHouse, runs the
indexer for a fixed duration, and reports blocks/s and events/s:

```bash
bun ../run.ts
```

Or drive it manually from the sqd-go checkout:

```bash
cd ../../../../sqd-go
go run . start ../open-indexer-benchmark/sentio-benchmarks-may-2025/case_1_lbtc_event_only/sqd-go --restart
```

## Benchmark specification

- **Target contract**: LBTC Token (`0x8236a87084f8B84306f72007F36F2618A5634494`)
- **Events indexed**: `Transfer` only
- **Block range**: 20,600,000 – 22,200,000 (Ethereum mainnet)
- **Data operations**: write-only, no derived state
- **RPC calls**: none — data comes from the SQD Portal event stream

## Results table

Generated table: `case_1_lbtc_event_only.lbtc_transfer_events` in the local
ClickHouse instance (native port from `.env`, default `9003`).

Measured via `bun ../run.ts` (full 20,600,000–22,200,000 range, capped at the
reference Sqd's 10m — completed naturally, well under the cap):

| Metric | Value |
| --- | --- |
| Time to complete | 482.3s (~8m2s) |
| Blocks | 1,599,998 |
| Events | 293,126 |
| blocks/s | 3,317.3 |
| events/s | 607.7 |

293,126 vs. the reference platforms' 296,734 (~1.2% fewer) — likely a handful
of early events before `start_block: 20,600,000`; see the case_1 README's
note on Ponder's similar ~5% gap for the same kind of discrepancy.
