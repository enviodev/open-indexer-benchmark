# Squid SDK: ERC20 Account Balances

[Squid SDK](https://docs.sqd.dev/en/sdk/overview) implementation of the ERC20 Account Balances benchmark.

## Data source

The processor configures exactly one data source, named by `SQD_SOURCE`:

- `network` (the default) sets the SQD Network gateway and no RPC endpoint.
  The gateway requires an API key as of 19 May 2026 — create one at
  [portal.sqd.dev](https://portal.sqd.dev) and set `SQD_API_KEY`, or the
  processor fails with `CREDENTIALS_INVALID` and indexes nothing.
- `rpc` sets `RPC_ENDPOINT` and no gateway, so RPC serves the whole sync. This
  is the regime SQD documents for chains its network does not cover, and it
  needs no API key.

Neither mode configures the other's source. A processor holding both falls back
to RPC near the head, which would leave the network run measuring a mixture of
the two.

The benchmark measures both, as the `sqd` and `sqd-rpc` rows.

## Setup

Requires Docker (for PostgreSQL) and Node.js >= 18.

```bash
pnpm install
```

## Running locally

```bash
# Start PostgreSQL
docker compose up -d

# Build
pnpm build

# Apply migrations
npx squid-typeorm-migration apply

# Start the processor (in one terminal)
pnpm process

# Start the GraphQL server (in another terminal)
pnpm serve
```

The GraphQL playground is available at `http://localhost:4350/graphql`.
