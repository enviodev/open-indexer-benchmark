# Rindexer ERC20 Benchmark

[rindexer](https://rindexer.xyz/) is an EVM blockchain indexing framework written in Rust.

This benchmark indexes ERC-20 `Transfer` and `Approval` events on the Rocket Pool rETH token contract on Ethereum Mainnet from block 18,600,000, and aggregates account balances and allowances from them.

It is a `rust` project rather than a `no-code` one. `rindexer codegen` produces the typings and the event-table inserts under `src/rindexer_lib/`; the aggregation on top of them lives in `src/rindexer_lib/indexers/erc_20indexer/rocket_token_reth.rs`, which is the file rindexer intends you to edit. A running balance is a read-modify-write, which the declarative `tables:` operations of a no-code project cannot express, so each batch is summed in memory and applied as one upsert with the arithmetic in SQL.

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

## Health Check

```bash
curl http://localhost:8082/health
```
