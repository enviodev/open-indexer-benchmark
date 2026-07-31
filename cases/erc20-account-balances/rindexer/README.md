# Rindexer ERC20 Benchmark

[rindexer](https://rindexer.xyz/) is an EVM blockchain indexing framework written in Rust.

This benchmark indexes ERC-20 `Transfer` and `Approval` events on the Rocket Pool rETH token contract on Ethereum Mainnet from block 18,600,000, and aggregates account balances and allowances from them.

## Why this is a rust project

rindexer supports both `no-code` and `rust` projects, and the other case in this benchmark uses `no-code`. This one does not, because `no-code` could not compute the balances correctly.

A running balance is a read-modify-write. A `no-code` project can only describe table operations declaratively in `rindexer.yaml`, so the case had to become a sequence of independent upserts — credit the recipient, then debit the sender. On most runs the debit was lost, leaving 465 of 1,747 accounts absent and 672 with the wrong balance. It was intermittent, and neither reordering the operations nor splitting them across separate event entries fixed it.

A `rust` project hands the handler a database connection, so the aggregation is ordinary code: each batch is summed in memory into one signed delta per address, then applied as a single upsert with the arithmetic in SQL. There is no second write to lose.

`rindexer codegen` produces the typings and the event-table inserts under `src/rindexer_lib/`. Only the aggregation in `src/rindexer_lib/indexers/erc_20indexer/rocket_token_reth.rs` is hand-written — that is the file rindexer intends you to edit.

## Pre-requisites

- A Rust toolchain ([rustup](https://rustup.rs))
- [Docker](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

## Setup

1. Start PostgreSQL:

```bash
docker compose up -d
```

2. Copy the `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your RPC endpoint
```

## Run

Build the project, then start both the indexer and GraphQL API:

```bash
cargo build --release
./target/release/erc20indexer
```

The GraphQL playground will be available at `http://localhost:19876/playground`.

## Regenerating the typings

After changing `rindexer.yaml`, regenerate the code under `src/rindexer_lib/typings/` with the [rindexer CLI](https://rindexer.xyz/docs/start-building/installation):

```bash
rindexer codegen typings
```

`rindexer codegen indexer` regenerates the handler file too, which would overwrite the aggregation and reinstate the per-batch progress logging this benchmark removes — it sits on the hot path and no other implementation here logs progress.

## Health Check

```bash
curl http://localhost:8082/health
```
