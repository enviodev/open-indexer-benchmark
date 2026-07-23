# sqd-go Implementation - Ethereum Block Benchmark

An [sqd-go](https://github.com/subsquid-labs/sqd-go) implementation of
case_3's block-level indexing — no contracts, no events, no RPC. This is
`config.yaml` only (`store_blocks: true` is enough; no custom processor
needed, so no `--state` flag either). sqd-go itself is a sibling checkout
(see [`../../case_1_lbtc_event_only/sqd-go/README.md`](../../case_1_lbtc_event_only/sqd-go/README.md)
for the same prerequisite). `../run.ts` builds and drives it.

## Coverage note

sqd-go's built-in `blocks` table stores `chain_id`, `block_number`,
`block_timestamp`, and `block_hash` — case_3's similarity analysis compares
those plus `parent_hash`, which the built-in table doesn't carry (it isn't an
RPC field, just not one of the four columns `store_blocks` generates). No
custom processor is added here to capture it — this benchmark is measuring
indexing throughput, not chasing exact field parity with the reference
implementations. Every other tracked field (number, hash, timestamp) is
captured for the full range.

## Benchmark specification

- **Target**: Ethereum blocks (no contract/event filter)
- **Block range**: 0 – 100,000
- **Data operations**: block-level indexing only
- **RPC calls**: none

## Setup

```bash
cp .env.example .env   # then set SQD_API_TOKEN
```

## Running

```bash
bun ../run.ts
```

Or manually from the sqd-go checkout:

```bash
cd ../../../../sqd-go
go run . start ../open-indexer-benchmark/sentio-benchmarks-may-2025/case_3_ethereum_block/sqd-go --restart
```
