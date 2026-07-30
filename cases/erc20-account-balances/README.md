# ERC20 Account Balances

This benchmark is inspired by the one used on the [Ponder landing page](https://ponder.sh/).

Index the Rocket Pool ERC20 token contract (RocketTokenRETH) on Ethereum Mainnet from block 18,600,000. Write decoded event logs + aggregate account balances in a database.

## Benchmark Specification

- **Target Contract**: RocketTokenRETH (Rocket Pool)
- **Events Indexed**: Transfer and Approval events
- **Block Range**: 18,600,000 to latest
- **Verification Range**: 18,600,000 to 18,699,999 — indexed to completion, then checked against `expected.json`
- **Features**: `event decoding`, `storage write`, `storage update on conflict`

## Case Logic

For each **Transfer** event:

1. Upsert the sender account: create it with a zero balance if it does not exist, then subtract the transfer value from its balance. An account seen for the first time as a sender therefore ends up with a negative balance, not a zero one.
2. Upsert the recipient account: create it with a zero balance if it does not exist, then add the transfer value to its balance.
3. Insert a transfer event record with the event id, amount, timestamp, sender, and recipient.

Every address that appears as either sender or recipient gets an account row, and because the debit and the credit are applied to the same running balance, a transfer where sender and recipient are the same address leaves that balance unchanged. The verification range contains 1,747 accounts and three self-transfers, so both are checked rather than assumed.

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

Requires Node 23.6+, Docker, an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth, and an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Sqd implementation.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-account-balances/run.ts
```

Each indexer first indexes the verification range to completion, and its database is checked against `expected.json` and measured for size. It then re-runs for the throughput window unless it was too slow to finish the range within that window, in which case its rate comes from the verification run instead.

The throughput window defaults to 60 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-account-balances/run.ts --duration=60
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-account-balances/run.ts envio ponder subquery
```

### Ground truth

`expected.json` holds a row count and a checksum per entity for the verification range. Regenerate it after changing the range, the contract, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts erc20-account-balances
```

## Implementation Notes

All indexers share port `19876` for their GraphQL endpoint. Within a single run the indexers are benchmarked one after another, and in CI each indexer gets its own runner, so there is no conflict.

### Envio

Runs natively via `envio start -r`, which resets the database on each start. Hasura is disabled (`ENVIO_HASURA=false`) since the benchmark reads PostgreSQL directly. The benchmark timer starts when the process launches; Envio's internal init is fast enough that it doesn't materially affect the measurement.

The `envio-rpc` variant forces RPC mode for historical sync (`ENVIO_RPC_FOR=sync`) instead of HyperSync.

### Ponder

Runs natively via `ponder start` — the production command, which builds once and ignores file changes — backed by a Postgres container. `start` rejects the dev-only `--disable-ui` flag and requires an explicit `--schema`, so its invocation differs from `ponder dev`. The `--port` flag binds the GraphQL server to the benchmark port. The two account upserts in the Transfer handler must remain sequential so a self-transfer nets to zero rather than losing one of the two writes.

### Rindexer

Runs a native binary (`rindexer start all`) with a separate Postgres container. Postgres is started via Docker Compose before the timer begins, then the rindexer binary launches with the timer. Uses `no-code` mode with declarative YAML config.

### Sqd (Subsquid)

Runs the processor and GraphQL server as separate native Node.js processes. Uses a Docker Postgres instance for storage. The handler batches all events in memory per block range, then flushes accounts, allowances, transfer events, and approval events concurrently via `Promise.all`.

Sqd ingests from the SQD archive (`v2.archive.subsquid.io`), which requires an API key as of 19 May 2026. Set `SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it the processor fails with `CREDENTIALS_INVALID` and indexes nothing.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node + graphql-engine). This has the heaviest startup overhead:

- **Docker/DB pre-initialization**: Postgres is started and health-checked _before_ the benchmark timer begins. Image pulls also happen beforehand. This is not counted toward the benchmark duration.
- **Startup cost**: SubQuery's `subquery-node` takes ~25 seconds to boot inside Docker. Because SubQuery is too slow to index the verification range within the throughput window, its rate is measured over that range, where the boot time is a small and honestly counted fraction of a multi-minute run.
- **`project.ts` env vars**: The `project.ts` config reads `ETHEREUM_RPC_URL` and `SUBQUERY_END_BLOCK`, both baked into `project.yaml` at codegen/build time, so the benchmark passes them during `codegen` and `build`. A missing end block throws rather than defaulting, since an unbounded run would never complete the verification phase.
- **Dictionary errors**: The SubQuery node logs `dictionary-v1` warnings (backend error 1601). This is a known issue with the default dictionary endpoint and doesn't prevent indexing, but may slow it down slightly as the node falls back to direct RPC fetching.
