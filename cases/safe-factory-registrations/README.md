# Factory Contract Registration

Index the Safe proxy factory on Ethereum Mainnet from block 24,600,000 and every proxy it creates. The verification range ends once the factory has announced its 100,000th proxy, so each indexer finishes the phase holding a dynamic contract set six figures deep.

The other cases fix the contract set in configuration. This one does not: nothing is known about the children at build time, and the set grows throughout the run. What is measured is the cost of that growth — how an indexer's per-contract bookkeeping, address matching and log filtering hold up when the set is 100,000 contracts rather than one.

## Benchmark Specification

- **Target Contract**: Safe proxy factory v1.3.0 (`0xa6b71e26c5e0845f74c812102ca7114b6a896ab2`)
- **Events Indexed**: `ProxyCreation` on the factory, `SafeSetup` on every proxy it creates
- **Block Range**: 24,600,000 to latest
- **Verification Range**: 24,600,000 to 24,646,610 — indexed to completion, then checked against `expected.json`
- **Child contracts registered in that range**: 100,037
- **Features**: `dynamic contract registration`, `event decoding`, `storage write` (insert-only, no updates)

## Case Logic

For each **ProxyCreation** event on the factory:

1. Register the announced proxy address as a contract to index from then on.
2. Insert a safe record with the event id, proxy address, singleton address, and timestamp.

For each **SafeSetup** event emitted by a registered proxy:

1. Insert a safe setup record with the event id, the emitting proxy, the initiator, the threshold, and the timestamp.

There is no aggregation and nothing is read back. Registration cost is the variable under test, so everything else is kept to a plain insert.

### The SafeSetup ordering, and why it is in the case

A Safe proxy is deployed and set up in a single transaction, and the two logs come out in this order:

```
logIndex n      SafeSetup      ← emitted by the new proxy
logIndex n + 1  ProxyCreation  ← emitted by the factory, announcing that proxy
```

The child's event precedes the factory event that announces it. An indexer that discovers children strictly in event order has not registered the proxy at the moment its `SafeSetup` goes past, and cannot record it. An indexer that resolves the factory's child address set ahead of matching child logs can.

This is deliberate. Both designs are defensible, the difference is invisible in the usual factory example where children only emit events days later, and it decides whether a real Safe indexer sees the owners and threshold a safe was created with. The case exists partly to make that difference measurable, so a tool recording 0 of the 295 `SafeSetup` rows is reporting a design choice, not a bug, and the note under the results table says so.

Every implementation here is written the way that tool's own documentation recommends. None of them is nudged toward or away from capturing the setup events.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **Rindexer** — [rindexer/](./rindexer/)
- **Sqd** — [sqd/](./sqd/)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth, and an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Sqd implementation.

```bash
ENVIO_API_TOKEN=your-token node cases/safe-factory-registrations/run.ts
```

Each indexer indexes the verification range to completion — its database is then checked against `expected.json` and measured — before re-running for the throughput window. Indexers too slow to finish the range within that window skip it and report their rate from the verification run.

The verification phase allows 2,400 seconds here rather than the usual 900. The range is forty-six thousand blocks and a hundred thousand events, and a tool that runs out of time reports "could not verify", which would say nothing about the tool.

The throughput window defaults to 60 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/safe-factory-registrations/run.ts --duration=60
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/safe-factory-registrations/run.ts envio ponder subquery
```

### Ground truth

`expected.json` holds a row count and a checksum per entity. It is built in two passes — the factory's own logs, then the logs of the children those announced — so the child set comes from the chain rather than from a list. Regenerate it after changing the range, the contract, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts safe-factory-registrations
```

## Implementation Notes

All indexers share port `19876` for their GraphQL endpoint. A local run benchmarks them one after another and CI gives each its own runner, so there is no conflict.

### Envio

Runs natively via `envio start -r`, which resets the database on each start. Hasura is disabled (`ENVIO_HASURA=false`) since the benchmark reads PostgreSQL directly.

The `Safe` contract is declared in `config.yaml` with no address; `indexer.contractRegister` supplies one per `ProxyCreation`. The `envio-rpc` variant forces RPC mode for historical sync (`ENVIO_RPC_FOR=sync`) instead of HyperSync.

### Ponder

Runs natively via `ponder start` backed by a Postgres container. The child contract is declared with `factory({ address, event, parameter })`, which resolves the child address set from the factory's logs before matching child logs against it.

### Rindexer

Runs a native binary (`rindexer start all`) with a separate Postgres container, in `no-code` mode. The `Safe` contract's `details` carry a `factory` block naming the factory, its `ProxyCreation` event, and the `proxy` input holding the new address.

### Sqd (Subsquid)

Runs the processor and GraphQL server as separate native Node.js processes, with a Docker Postgres for storage.

There is no address list to give the processor for the children, so `SafeSetup` is subscribed to by topic chain-wide and the handler drops logs from proxies this factory did not create — the pattern SQD's own factory-contract guide describes. The set of known proxies is built as the batch is walked, in chain order.

Sqd ingests from the SQD archive (`v2.archive.subsquid.io`), which requires an API key as of 19 May 2026. Set `SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it the processor fails with `CREDENTIALS_INVALID` and indexes nothing.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node + graphql-engine), and carries the heaviest startup overhead — see the [Decoded Event Stream](../erc20-transfer-events/README.md) notes, which apply unchanged.

The proxy is indexed through a `Safe` template instantiated per `ProxyCreation` with `createSafeDatasource({ address })`.
