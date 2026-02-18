# ERC20 Transfer Events

This benchmark is inspired by the one used on the [Ponder landing page](https://ponder.sh/).

Index the Rocket Pool ERC20 token contract (RocketTokenRETH) on Ethereum Mainnet from block 18,600,000. Write decoded event logs + aggregate account balances in a database.

## Benchmark Specification

- **Target Contract**: RocketTokenRETH (Rocket Pool)
- **Events Indexed**: Transfer and Approval events
- **Block Range**: 18,600,000 to latest
- **Features**: `event decoding`, `storage write`, `storage update on conflict`

## Case Logic

For each **Transfer** event:

1. Upsert the sender account: if it exists, subtract the transfer value from its balance; otherwise, create it with a zero balance.
2. Upsert the recipient account: if it exists, add the transfer value to its balance; otherwise, create it with a zero balance.
3. Insert a transfer event record with the event id, amount, timestamp, sender, and recipient.

For each **Approval** event:

1. Upsert the allowance record keyed by (owner, spender): if it exists, update the amount; otherwise, create it with the approved value.
2. Insert an approval event record with the event id, amount, timestamp, owner, and spender.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **Rindexer** — [rindexer/](./rindexer/)
- **Sqd** — [sqd/](./sqd/)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, and an [Envio](https://envio.dev) API token for the RPC endpoint.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts
```

By default the benchmark runs for 60 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts --duration=60
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts envio ponder subquery
```

## Implementation Notes

All indexers share port `19876` for their GraphQL endpoint. Since benchmarks run sequentially, there is no conflict.

### Envio

Runs natively via `envio start -r`. Manages its own Docker infrastructure internally (Hasura). The external Hasura port is configured via `HASURA_EXTERNAL_PORT` env var to use the shared benchmark port. The benchmark timer starts when the process launches; Envio's internal Docker init is fast enough that it doesn't materially affect the measurement.

### Ponder

Runs natively via `ponder dev`. Uses an embedded SQLite-like store, no external database. The `--port` flag is used to bind to the benchmark port. The two account upserts in the Transfer handler must remain sequential to handle self-transfers correctly.

### Rindexer

Runs a native binary (`rindexer start all`) with a separate Postgres container. Postgres is started via Docker Compose before the timer begins, then the rindexer binary launches with the timer. Uses `no-code` mode with declarative YAML config.

### Sqd (Subsquid)

Runs the processor and GraphQL server as separate native Node.js processes. Uses a Docker Postgres instance for storage. The handler batches all events in memory per block range, then flushes accounts, allowances, transfer events, and approval events concurrently via `Promise.all`.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node + graphql-engine). This has the heaviest startup overhead:

- **Docker/DB pre-initialization**: Postgres is started and health-checked _before_ the benchmark timer begins. Image pulls also happen beforehand. This is not counted toward the benchmark duration.
- **5x duration multiplier**: SubQuery's `subquery-node` takes ~25 seconds to boot inside Docker (spawning workers, connecting to the RPC). To amortize this startup cost fairly, SubQuery runs for 5x the requested duration and the results are divided by 5.
- **`project.ts` env var**: The `project.ts` config uses `process.env.ETHEREUM_RPC_URL` which gets baked into `project.yaml` at codegen/build time. The benchmark passes this env var during `codegen` and `build`, otherwise the endpoint resolves to `null`.
- **Dictionary errors**: The SubQuery node logs `dictionary-v1` warnings (backend error 1601). This is a known issue with the default dictionary endpoint and doesn't prevent indexing, but may slow it down slightly as the node falls back to direct RPC fetching.
