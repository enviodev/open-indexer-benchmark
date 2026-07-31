# ERC20 Transfer Events

Index the USDC ERC20 token contract on Ethereum Mainnet from block 18,600,000. Store the raw decoded Transfer event logs in a database — no aggregation, no derived state.

This is a pure write-only throughput benchmark: every Transfer event is decoded and inserted as its own row, with no balance accounting or upserts. USDC is one of the highest-volume contracts on Ethereum, making this a stress test for raw event ingestion.

## Benchmark Specification

- **Target Contract**: USDC (`0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`)
- **Events Indexed**: Transfer events only
- **Block Range**: 18,600,000 to latest
- **Verification Range**: 18,600,000 to 18,600,999 — indexed to completion, then checked against `expected.json`
- **Features**: `event decoding`, `storage write` (insert-only, no updates)

## Case Logic

For each **Transfer** event:

1. Insert a transfer event record with the event id, amount, timestamp, sender, and recipient.

There is no aggregation — accounts, balances, and allowances are intentionally not tracked. This isolates raw event-ingestion throughput from the cost of read-after-write upserts measured by the [ERC20 Account Balances](../erc20-account-balances/) case.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **Rindexer** — [rindexer/](./rindexer/)
- **Sqd** — [sqd/](./sqd/)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth, and an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Sqd implementation.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts
```

Each indexer indexes the verification range to completion — its database is then checked against `expected.json` and measured — before re-running for the throughput window. Indexers too slow to finish the range within that window skip it and report their rate from the verification run.

The throughput window defaults to 60 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts --duration=60
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts envio ponder subquery
```

### Ground truth

`expected.json` holds a row count and a checksum per entity. Regenerate it after changing the range, the contract, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts erc20-transfer-events
```

## Implementation Notes

All indexers share port `19876` for their GraphQL endpoint. A local run benchmarks them one after another and CI gives each its own runner, so there is no conflict.

### Envio

Runs natively via `envio start -r`, which resets the database on each start. Hasura is disabled (`ENVIO_HASURA=false`) since the benchmark reads PostgreSQL directly. The timer starts when the process launches; Envio's internal init is fast enough not to materially affect the measurement.

The `envio-rpc` variant forces RPC mode for historical sync (`ENVIO_RPC_FOR=sync`) instead of HyperSync.

### Ponder

Runs natively via `ponder start` — the production command, which builds once and ignores file changes — backed by a Postgres container. It rejects the dev-only `--disable-ui` flag and requires an explicit `--schema`, so the invocation differs from `ponder dev`. `--port` binds the GraphQL server to the benchmark port. The Transfer handler is a single insert with no upserts.

### Rindexer

Runs a native binary (`rindexer start all`) with a separate Postgres container. Uses `no-code` mode with declarative YAML config. Only the Transfer event is included, so rindexer creates a single raw `transfer` event table and no aggregation tables.

### Sqd (Subsquid)

Runs the processor and GraphQL server as separate native Node.js processes. Uses a Docker Postgres instance for storage. The handler batches all Transfer events in memory per block range, then inserts them.

Sqd ingests from the SQD archive (`v2.archive.subsquid.io`), which requires an API key as of 19 May 2026. Set `SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it the processor fails with `CREDENTIALS_INVALID` and indexes nothing.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node + graphql-engine). This has the heaviest startup overhead:

- **Docker/DB pre-initialization**: Postgres is started and health-checked _before_ the benchmark timer begins. Image pulls also happen beforehand. This is not counted toward the benchmark duration.
- **Startup cost**: `subquery-node` takes ~25s to boot inside Docker. SubQuery is too slow to finish the verification range within the throughput window, so its rate comes from that range, where boot time is a small and honestly counted fraction of a multi-minute run.
- **`project.ts` env vars**: `ETHEREUM_RPC_URL` and `SUBQUERY_END_BLOCK` are baked into `project.yaml` at codegen/build time, so the benchmark passes both during `codegen` and `build`. A missing end block throws rather than defaulting, since an unbounded run would never complete the verification phase.
