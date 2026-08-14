# Rindexer ERC20 Benchmark

[rindexer](https://rindexer.xyz/) is a no-code EVM blockchain indexing framework written in Rust.

This benchmark indexes raw ERC-20 `Transfer` events on the USDC token contract on Ethereum Mainnet from block 18,600,000.

The one project backs two benchmark rows: `rindexer` reads logs over plain
RPC, and `rindexer-hypersync` reads them from
[HyperSync](https://docs.envio.dev/docs/HyperSync/overview). The switch is the
`RINDEXER_HYPERSYNC` variable substituted into `rindexer.yaml` — see
`.env.example` for the values each row runs with.

## Pre-requisites

- [rindexer CLI](https://rindexer.xyz/docs/start-building/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

### Install rindexer

```bash
curl -L https://rindexer.xyz/install.sh | bash
```

For the HyperSync row: released binaries do not carry HyperSync support yet
(it is under review in
[joshstevens19/rindexer#457](https://github.com/joshstevens19/rindexer/pull/457)),
so build the CLI from the branch pinned in `cases/lib/drivers/rindexer.ts` and
set `ENVIO_API_TOKEN` (create one at
[envio.dev/app/api-tokens](https://envio.dev/app/api-tokens)):

```bash
cargo install --locked --git https://github.com/moose-code/rindexer \
  --rev <HYPERSYNC_CLI_REV from the driver> rindexer_cli
```

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

Start both the indexer and GraphQL API:

```bash
rindexer start all
```

The GraphQL playground will be available at `http://localhost:3001/playground`.

## Health Check

```bash
curl http://localhost:8082/health
```
