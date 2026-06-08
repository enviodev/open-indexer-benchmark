# Rindexer ERC20 Benchmark

[rindexer](https://rindexer.xyz/) is a no-code EVM blockchain indexing framework written in Rust.

This benchmark indexes ERC-20 `Transfer` and `Approval` events on the Rocket Pool rETH token contract on Ethereum Mainnet from block 18,600,000.

## Pre-requisites

- [rindexer CLI](https://rindexer.xyz/docs/start-building/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

### Install rindexer

```bash
curl -L https://rindexer.xyz/install.sh | bash
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
