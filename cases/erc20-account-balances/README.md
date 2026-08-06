# State Aggregation

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

1. Upsert the sender account: create it with a zero balance if it does not exist, then subtract the transfer value. An account first seen as a sender therefore ends up negative, not zero.
2. Upsert the recipient account: create it with a zero balance if it does not exist, then add the transfer value.
3. Insert a transfer event record with the event id, amount, timestamp, sender, and recipient.

Every address seen as sender or recipient gets an account row, and since debit and credit apply to the same running balance, a self-transfer leaves it unchanged. The verification range contains 1,747 accounts and three self-transfers, so both are checked rather than assumed.

For each **Approval** event:

1. Upsert the allowance record keyed by (owner, spender): if it exists, update the amount; otherwise, create it with the approved value.
2. Insert an approval event record with the event id, amount, timestamp, owner, and spender.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **Rindexer** — [rindexer/](./rindexer/)
- **Squid SDK** — [sqd/](./sqd/)
- **Subgraph** — [subgraph/](./subgraph/) (requires Docker)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, a Rust toolchain (for the rindexer implementation), an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth, and an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Squid SDK run that reads from SQD Network.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-account-balances/run.ts
```

Each indexer indexes the verification range to completion — its database is then checked against `expected.json` and measured — before re-running for the throughput window. Indexers too slow to finish the range within that window skip it and report their rate from the verification run.

The verification run is capped at ten minutes. An indexer that has not finished by then is stopped there and verified on what it did index, so its row carries a rate, a `~` storage figure scaled from the share of the range it covered, and a note naming the share of the data it is missing rather than no result at all.

The throughput window defaults to 100 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-account-balances/run.ts --duration=100
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-account-balances/run.ts envio ponder subquery
```

### Ground truth

`expected.json` holds a row count and a checksum per entity. Regenerate it after changing the range, the contract, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts erc20-account-balances
```

## Implementation Notes

Progress and correctness are both read straight from each indexer's PostgreSQL database, never through its GraphQL API. Two reasons: an indexer serving queries alongside its indexing is doing work the benchmark does not measure but does pay for, and every API models the same data differently enough that the polling code was becoming a per-indexer dialect. So none of the GraphQL servers is started — `squid-graphql-server` is not launched, rindexer is started with indexing only (`start indexer` for a no-code project, `--indexer` for a rust one), and SubQuery's `graphql-engine` container is gone from its compose file. Ponder and Graph Node are the exceptions: `ponder start` and `gnd dev` both always serve an API, so each is bound to port `19876` and otherwise ignored.

The tables backing each entity are found by introspection against the `tableCandidates` in `case.config.ts` — the same resolution the verification layer uses — so a case names its entities once instead of once per indexer.

### Envio

Runs natively via `envio start -r`, which resets the database on each start. Hasura is disabled (`ENVIO_HASURA=false`) since the benchmark reads PostgreSQL directly. The timer starts when the process launches; Envio's internal init is fast enough not to materially affect the measurement.

The `envio-rpc` variant forces RPC mode for historical sync (`ENVIO_RPC_FOR=sync`) instead of HyperSync.

### Ponder

Runs natively via `ponder start` — the production command, which builds once and ignores file changes — backed by a Postgres container. It rejects the dev-only `--disable-ui` flag and requires an explicit `--schema`, so the invocation differs from `ponder dev`. `--port` binds the API server it insists on running to the benchmark port. The two account upserts in the Transfer handler must remain sequential so a self-transfer nets to zero rather than losing one of the two writes.

### Rindexer

A `rust` project rather than the `no-code` setup the other case uses, because `no-code` could not compute the balances correctly. A running balance is a read-modify-write, but `no-code` can only describe table operations declaratively in `rindexer.yaml`, so the case had to become a sequence of independent upserts — and the debit was intermittently lost, leaving 465 of 1,747 accounts absent and 672 holding the wrong balance. Reordering the operations and splitting them across event entries changed which addresses broke, but never fixed it.

The `rust` project type hands the handler a database connection, so the aggregation is ordinary code: each batch is summed in memory into one signed delta per address, then applied as a single upsert whose arithmetic runs in SQL (`balance = account.balance + EXCLUDED.balance`). There is no second write to lose, so a self-transfer netting to zero and a sender-only address ending up negative hold by construction. Allowances collapse to the last value per `(owner, spender)` pair first, since Postgres rejects an `ON CONFLICT` that touches the same row twice.

Event tables and their inserts are exactly what `rindexer codegen` produces. Only the aggregation in `src/rindexer_lib/indexers/erc_20indexer/rocket_token_reth.rs` is hand-written — the file rindexer intends you to edit — and codegen's per-batch progress logging is removed, since it sits on the hot path and no other implementation here logs progress.

The crate is built with `cargo build --release` before the timer begins, and Postgres runs in a separate container started beforehand. Two things follow: the `rindexer` crate is pinned to a git tag rather than tracking `master`, so runs are reproducible, and the binary is built from source rather than being the released CLI. `rindexer new rust` also does not scaffold a rustls crypto provider while the dependency graph enables two, so `main` installs one explicitly — without it the binary panics on its first HTTPS request.

### Squid SDK

Runs the processor as a native Node.js process against a Docker Postgres instance. The handler batches all events in memory per block range, then flushes accounts, allowances, transfer events, and approval events concurrently via `Promise.all`.

The `sqd` variant ingests from the SQD Network gateway (`v2.archive.subsquid.io`), which requires an API key as of 19 May 2026. Set `SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it the processor fails with `CREDENTIALS_INVALID` and indexes nothing.

The `sqd-rpc` variant runs the same project with the gateway left off (`SQD_SOURCE=rpc`), so it ingests from the RPC endpoint alone — the regime SQD documents for chains SQD Network does not cover. It needs no API key. Each variant configures only its own source: the `sqd` run is given no RPC endpoint at all, since a processor holding both falls back to RPC near the head and its row would then be measuring a mixture of the two.

### Subgraph

Runs Graph Node natively via `gnd dev` — the single-binary distribution of
graph-node — backed by a Postgres container. `gnd` builds and deploys the
subgraph itself on startup, so there is no separate `graph create` /
`graph deploy` step to keep out of the measured window, and no IPFS or Docker
Compose stack to stand up. The binary is pinned to a Graph Node release tag in
[`cases/lib/drivers/subgraph.ts`](../lib/drivers/subgraph.ts).

- **`subgraph.yaml` is generated**: the manifest is rendered from
  `subgraph.template.yaml` before codegen, with `startBlock`/`endBlock` baked in
  for the phase being run.
- **Postgres locale**: Graph Node requires a `UTF8` / `C` database, so the
  container is started with `POSTGRES_INITDB_ARGS=-E UTF8 --locale=C`.
- **Logging**: `gnd` defaults to debug logging, which writes a line per trigger.
  The driver sets `GRAPH_LOG=info`, the production default.
- **Entity storage**: transfer and approval events are declared
  `@entity(immutable: true)`; accounts and allowances are updated in place and
  stay mutable, which is what makes this case a read-after-write test. Mutable
  entity tables keep every superseded version in a `block_range` column, so
  verification restricts them to the current version — the retained history
  still counts toward the reported storage, which is the honest way to report
  what keeping it costs.
- **Write batching**: Graph Node buffers entity writes and flushes them in
  batches, so both the tables and `subgraphs.head` stay at zero for the first
  minute or two of a run and then jump. Progress is therefore stepped rather
  than continuous, and the measured time can run up to one poll interval past
  the actual finish — which overstates the time rather than flattering it. Both
  scenarios take longer than the throughput window, so the published rate comes
  from the verification range, where the batching is fully accounted for.
- **Progress**: read from `subgraphs.head`, Graph Node's own record of where the
  deployment has got to — the same position its status API serves. It keeps
  advancing through ranges that produced no events, which a row count cannot.
- **IPFS**: `gnd` connects to `https://api.thegraph.com/ipfs` at startup even
  though everything it deploys is local, so the run needs outbound network
  access to that host.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node). This has the heaviest startup overhead:

- **Docker/DB pre-initialization**: Postgres is started and health-checked _before_ the benchmark timer begins. Image pulls also happen beforehand. This is not counted toward the benchmark duration.
- **Startup cost**: `subquery-node` takes ~25s to boot inside Docker. SubQuery is too slow to finish the verification range within the throughput window, so its rate comes from that range, where boot time is a small and honestly counted fraction of a multi-minute run.
- **`project.ts` env vars**: `ETHEREUM_RPC_URL` and `SUBQUERY_END_BLOCK` are baked into `project.yaml` at codegen/build time, so the benchmark passes both during `codegen` and `build`. A missing end block throws rather than defaulting, since an unbounded run would never complete the verification phase.
- **Dictionary errors**: The SubQuery node logs `dictionary-v1` warnings (backend error 1601). This is a known issue with the default dictionary endpoint and doesn't prevent indexing, but may slow it down slightly as the node falls back to direct RPC fetching.
