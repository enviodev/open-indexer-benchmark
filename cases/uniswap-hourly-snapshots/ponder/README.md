# Ponder: Time-Based Snapshots

[Ponder](https://ponder.sh) implementation of the Uniswap V3 hourly snapshot benchmark.

The snapshot is a block interval (`blocks` in `ponder.config.ts`) with `interval: 1`, so `HourlySnapshot:block` runs on every block. Ponder orders a block event after every log of the same block, so the handler sees that block's swaps and rewrites the hour's row each time, leaving it holding the pool as of the hour's last block.

## Setup

Requires Node.js >= 18 and Docker (for PostgreSQL).

```bash
pnpm install
```

## Running locally

```bash
PONDER_RPC_URL_1=https://... PONDER_END_BLOCK=21199995 pnpm dev
```

The GraphQL endpoint is served at `http://localhost:42069`.
