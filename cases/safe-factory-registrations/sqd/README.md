# Sqd: Factory Contract Registration

[Subsquid](https://docs.sqd.ai/) implementation of the Safe proxy factory benchmark.

There is no address list to hand the processor for the children, so `SafeSetup` is subscribed to by topic chain-wide and `main.ts` drops logs from proxies this factory did not create — the pattern SQD's factory-contract guide describes. The set of known proxies is built as each batch is walked, in chain order.

## Setup

Requires Docker (for PostgreSQL) and Node.js >= 18.

```bash
pnpm install
```

Sqd's archive requires an API key as of 19 May 2026 — create one at [portal.sqd.dev](https://portal.sqd.dev) and set `SQD_API_KEY`. See `.env.example`.

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
