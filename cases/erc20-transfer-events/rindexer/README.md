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

The HyperSync row needs rindexer v0.43.0 or newer (the release that shipped
`networks[].hypersync`) and an `ENVIO_API_TOKEN` (create one at
[envio.dev/app/api-tokens](https://envio.dev/app/api-tokens)); the driver
refuses to run it on an older CLI rather than silently measure RPC.

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
