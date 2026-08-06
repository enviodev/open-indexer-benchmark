# Squid SDK: Factory Contract Registration

[Squid SDK](https://docs.sqd.dev/en/sdk/overview) implementation of the Safe proxy factory benchmark.

There is no address list to hand the processor for the children, so `SafeSetup` is subscribed to by topic chain-wide and `main.ts` drops logs from proxies this factory did not create — the pattern SQD's factory-contract guide describes. The set of known proxies is built as each batch is walked, in chain order.

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

# Generate models, build, migrate
pnpm codegen
pnpm build
npx squid-typeorm-migration apply

# Start the processor
SQD_END_BLOCK=24646610 RPC_ENDPOINT=https://... pnpm process
```
