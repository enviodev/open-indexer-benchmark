# Sqd: ERC20 Transfer Events

[Subsquid](https://docs.sqd.ai/) implementation of the ERC20 Transfer Events benchmark.

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
