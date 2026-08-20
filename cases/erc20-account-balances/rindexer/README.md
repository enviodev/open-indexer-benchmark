# Rindexer ERC20 Benchmark

[rindexer](https://rindexer.xyz/) is an EVM blockchain indexing framework written in Rust.

This benchmark indexes ERC-20 `Transfer` and `Approval` events on the Rocket Pool rETH token contract on Ethereum Mainnet from block 18,600,000, and aggregates account balances and allowances from them.

It is a `no-code` project: the aggregation is declared in `rindexer.yaml` as
table operations — credit the recipient, debit the sender, set the allowance.
For a while this case had to be a `rust` project instead, because rindexer's
arithmetic upserts intermittently lost the debit when the credit created the
row; that was fixed upstream in v0.42.1
([joshstevens19/rindexer#460](https://github.com/joshstevens19/rindexer/pull/460)),
so the declarative version is back.

The one project backs two benchmark rows: `rindexer` reads logs over plain
RPC, and `rindexer-hypersync` reads them from
[HyperSync](https://docs.envio.dev/docs/HyperSync/overview). The switch is the
`RINDEXER_HYPERSYNC` variable substituted into `rindexer.yaml` — see
`.env.example`. The HyperSync row needs rindexer v0.43.0 or newer (the release
that shipped `networks[].hypersync`) and an `ENVIO_API_TOKEN`.

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

```bash
rindexer start indexer
```

## Health Check

```bash
curl http://localhost:8082/health
```
