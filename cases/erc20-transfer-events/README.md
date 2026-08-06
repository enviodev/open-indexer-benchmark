# Decoded Event Stream

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
- **Squid SDK** — [sqd/](./sqd/)
- **Subgraph** — [subgraph/](./subgraph/) (requires Docker)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth, and an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Squid SDK run that reads from SQD Network.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts
```

Each indexer indexes the verification range to completion — its database is then checked against `expected.json` and measured — before re-running for the throughput window. Indexers too slow to finish the range within that window skip it and report their rate from the verification run.

The verification run is capped at ten minutes. An indexer that has not finished by then is stopped there and verified on what it did index, so its row carries a rate, a `~` storage figure scaled from the share of the range it covered, and a note naming the share of the data it is missing rather than no result at all.

The throughput window defaults to 100 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts --duration=100
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

Progress and correctness are both read straight from each indexer's PostgreSQL database, never through its GraphQL API. Two reasons: an indexer serving queries alongside its indexing is doing work the benchmark does not measure but does pay for, and every API models the same data differently enough that the polling code was becoming a per-indexer dialect. So none of the GraphQL servers is started — `squid-graphql-server` is not launched, rindexer is started with indexing only (`start indexer` for a no-code project, `--indexer` for a rust one), and SubQuery's `graphql-engine` container is gone from its compose file. Ponder and Graph Node are the exceptions: `ponder start` and `gnd dev` both always serve an API, so each is bound to port `19876` and otherwise ignored.

The tables backing each entity are found by introspection against the `tableCandidates` in `case.config.ts` — the same resolution the verification layer uses — so a case names its entities once instead of once per indexer.

### Envio

Runs natively via `envio start -r`, which resets the database on each start. Hasura is disabled (`ENVIO_HASURA=false`) since the benchmark reads PostgreSQL directly. The timer starts when the process launches; Envio's internal init is fast enough not to materially affect the measurement.

The `envio-rpc` variant forces RPC mode for historical sync (`ENVIO_RPC_FOR=sync`) instead of HyperSync.

### Ponder

Runs natively via `ponder start` — the production command, which builds once and ignores file changes — backed by a Postgres container. It rejects the dev-only `--disable-ui` flag and requires an explicit `--schema`, so the invocation differs from `ponder dev`. `--port` binds the API server it insists on running to the benchmark port. The Transfer handler is a single insert with no upserts.

### Rindexer

Runs a native binary (`rindexer start indexer`, so no GraphQL server) with a separate Postgres container. Uses `no-code` mode with declarative YAML config. Only the Transfer event is included, so rindexer creates a single raw `transfer` event table and no aggregation tables.

### Squid SDK

Runs the processor as a native Node.js process against a Docker Postgres instance. The handler batches all Transfer events in memory per block range, then inserts them.

The `sqd` variant ingests from the SQD Network gateway (`v2.archive.subsquid.io`), which requires an API key as of 19 May 2026. Set `SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it the processor fails with `CREDENTIALS_INVALID` and indexes nothing.

The `sqd-rpc` variant runs the same project with the gateway left off (`SQD_SOURCE=rpc`), so it ingests from the RPC endpoint alone — the regime SQD documents for chains SQD Network does not cover. It needs no API key. Each variant configures only its own source: the `sqd` run is given no RPC endpoint at all, since a processor holding both falls back to RPC near the head and its row would then be measuring a mixture of the two.

### Subgraph

Runs Graph Node natively via `gnd dev` — the single-binary distribution of
graph-node — backed by a Postgres container. `gnd` builds and deploys the
subgraph itself on startup, so there is no separate `graph create` /
`graph deploy` step to keep out of the measured window, and no IPFS or
Docker Compose stack to stand up. The binary is pinned to a Graph Node release
tag in [`cases/lib/drivers/subgraph.ts`](../lib/drivers/subgraph.ts) and
installed with `graph node install`.

- **`subgraph.yaml` is generated**: the manifest is rendered from
  `subgraph.template.yaml` before codegen, with `startBlock`/`endBlock` baked
  in for the phase being run. A subgraph manifest has no environment-variable
  equivalent, and an unbounded run would never complete the verification phase.
- **Postgres locale**: Graph Node requires a `UTF8` / `C` database, which is
  not what the postgres image creates by default, so the container is started
  with `POSTGRES_INITDB_ARGS=-E UTF8 --locale=C`.
- **Logging**: `gnd` defaults to debug logging, which writes a line per trigger
  processed. The driver sets `GRAPH_LOG=info` — the production default — so the
  measurement is not charged for output no deployed indexer produces.
- **Entity storage**: transfer events are declared `@entity(immutable: true)`,
  the layout The Graph's documentation recommends for append-only event data.
  Immutable entity tables carry a `block$` column instead of the `block_range`
  used for mutable ones, so there are no superseded row versions to filter out.
- **Progress**: read from `subgraphs.head`, Graph Node's own record of where the
  deployment has got to — the same position its status API serves. It keeps
  advancing through ranges that produced no events, which a row count cannot.
- **Write batching**: Graph Node buffers entity writes and flushes them in
  batches, so both the tables and `subgraphs.head` stay at zero for the first
  minutes of a run and then jump. Progress is therefore stepped rather than
  continuous, and the measured time can run up to one poll interval past the
  actual finish — which overstates the time rather than flattering it. The case
  takes longer than the throughput window either way, so the published rate
  comes from the verification range.
- **IPFS**: `gnd` connects to `https://api.thegraph.com/ipfs` at startup even
  though everything it deploys is local, so the run needs outbound network
  access to that host.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node). This has the heaviest startup overhead:

- **Docker/DB pre-initialization**: Postgres is started and health-checked _before_ the benchmark timer begins. Image pulls also happen beforehand. This is not counted toward the benchmark duration.
- **Startup cost**: `subquery-node` takes ~25s to boot inside Docker. SubQuery is too slow to finish the verification range within the throughput window, so its rate comes from that range, where boot time is a small and honestly counted fraction of a multi-minute run.
- **`project.ts` env vars**: `ETHEREUM_RPC_URL` and `SUBQUERY_END_BLOCK` are baked into `project.yaml` at codegen/build time, so the benchmark passes both during `codegen` and `build`. A missing end block throws rather than defaulting, since an unbounded run would never complete the verification phase.
