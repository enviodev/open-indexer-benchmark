# Factory Contract Registration

Index the canonical Safe proxy factories on Ethereum Mainnet from block 24,600,000 to 24,660,000 and every proxy they create. Both phases run that one range, by the end of which the registered contract set is 199,977 deep.

The other cases fix the contract set in configuration. This one does not: nothing is known about the children at build time, and the set grows throughout the run. What is measured is the cost of that growth — how an indexer's per-contract bookkeeping, address matching and log filtering hold up as the set gets large.

## Benchmark Specification

- **Target Contracts**: the canonical Safe proxy factories
  | Version | Address | `ProxyCreation` layout |
  | --- | --- | --- |
  | v1.3.0 | [`0xa6b71e26…6ab2`](https://etherscan.io/address/0xa6b71e26c5e0845f74c812102ca7114b6a896ab2) | `(address proxy, address singleton)` |
  | v1.3.0 (eip155) | [`0xc2283458…10bc`](https://etherscan.io/address/0xc22834581ebc8527d974f8a1c97e1bea4ef910bc) | `(address proxy, address singleton)` |
  | v1.4.1 | [`0x4e1dcf7a…ec67`](https://etherscan.io/address/0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67) | `(address indexed proxy, address singleton)` |
  | v1.5.0 | [`0x14f2982d…5e7b`](https://etherscan.io/address/0x14f2982d601c9458f93bd70b218933a6f8165e7b) | `(address indexed proxy, address singleton)` |
- **Events Indexed**: `ProxyCreation` on the factories, and the fifteen events a Safe emits on every proxy they create
- **Block Range**: 24,600,000 to 24,660,000 — indexed to completion, then checked against `expected.json`
- **Child contracts registered in that range**: 199,977, six figures of dynamic contracts
- **Features**: `dynamic contract registration`, `event decoding`, `storage write` (insert-only, no updates)

Only the canonical factories are indexed. Several other contracts on mainnet emit the same `ProxyCreation` topic — some of them heavily — but they are not Safe deployments, and including them would make the case a topic scan rather than a factory case. The pre-1.3.0 factories are left out for the opposite reason: they emit a different event (`ProxyCreation(address)`) and have created nothing in this range.

### Two decode paths, one topic

`proxy` became an indexed argument in 1.4.1. The signature is unchanged, so the topic0 is identical, but the payload is not: up to 1.3.0 the proxy address is the first word of the data, and from 1.4.1 it is the first topic. A tool cannot decode one layout with the other's ABI, so both generations are declared separately in every implementation here — two contracts, two data sources, or two decoders, depending on what the tool offers.

## Case Logic

For each **ProxyCreation** event on a factory:

1. Register the announced proxy address as a contract to index from then on.
2. Insert a safe record with the event id, proxy address, singleton address, and timestamp.

For each **SafeSetup** event emitted by a registered proxy:

1. Insert a safe setup record with the event id, the emitting proxy, the initiator, the threshold, and the timestamp.

For each of the other **thirteen Safe events** emitted by a registered proxy:

1. Insert a record with the event id, the emitting proxy, the event's own arguments, and the timestamp.

There is no aggregation and nothing is read back. Registration cost is the variable under test, so everything else is kept to a plain insert.

### The child events

Fifteen events, the whole of what a Safe emits: `SafeSetup`, `SafeReceived`, `SafeModuleTransaction`, `SafeMultiSigTransaction`, `ExecutionSuccess`, `ExecutionFailure`, `ChangedThreshold`, `ChangedMasterCopy`, `ChangedFallbackHandler`, `ChangedGuard`, `ChangedModuleGuard`, `EnabledModule`, `DisabledModule`, `AddedOwner` and `RemovedOwner`.

Only `SafeSetup` fires in the transaction that creates the proxy; the rest fire for the life of the Safe, when the child is already registered and no tool loses them to discovery order. What they cost is matching. Across the range these fifteen topics are emitted 94,298 times chain-wide and 18,663 of those belong to proxies these factories created — `SafeReceived` alone is 52,882 against 413. A tool that hands its child address set to the data source pays for the 18,663. A tool that subscribes by topic and filters in the handler pays for all 94,298, on a contract set of 199,977 addresses.

### One topic, two layouts

Safe 1.4.x made an argument `indexed` on eight of these events — `ExecutionSuccess`, `ExecutionFailure`, `ChangedFallbackHandler`, `ChangedGuard`, `EnabledModule`, `DisabledModule`, `AddedOwner`, `RemovedOwner` — without changing the signature. The topic0 is therefore identical and the payload is not, and both versions are live: 5,638 `ExecutionSuccess` of the newer layout in the range against 666 of the older.

`ProxyCreation` has the same split, but there the emitting factory says which layout to expect. For a child it cannot be known before the log arrives — one proxy points at a 1.3.0 singleton, the next at a 1.4.1 one — so a tool has to decide per log. How each does it, and whether it can at all, is part of what the case measures:

| tool | how both layouts are declared |
| --- | --- |
| Envio | two events, the second renamed with `name:` |
| Ponder | two ABI items; an overloaded event is named by its full signature |
| Sqd | two decoders, picked in the handler from the log's topic count |
| Subgraph | two handlers; Graph Node runs whichever one's ABI can decode the log |
| SubQuery | one only — see the note below |
| Rindexer | neither — the case is skipped |

SubQuery resolves an event from its topic0 alone, so two fragments sharing one make every such log ambiguous and lose both layouts. It declares the 1.4.x layout, which is the majority, and the older layout goes undecoded — visible in the results table as missing rows rather than as a crash.

### The SafeSetup ordering, and why it is in the case

Most of the proxies these factories deploy are not Safes at all — a proxy points at whatever singleton its deployer chose, and only a small share of them are set up as a Safe and emit `SafeSetup`. That is why 199,977 registrations yield 10,524 setups. The rare event is the interesting one, because of where it lands.

A Safe proxy is deployed and set up in a single transaction, and the two logs come out in this order:

```text
logIndex n      SafeSetup      ← emitted by the new proxy
logIndex n + 1  ProxyCreation  ← emitted by the factory, announcing that proxy
```

The child's event precedes the factory event that announces it. An indexer that discovers children strictly in event order has not registered the proxy at the moment its `SafeSetup` goes past, and cannot record it. An indexer that resolves the factory's child address set ahead of matching child logs can.

This is deliberate. Both designs are defensible, the difference is invisible in the usual factory example where children only emit events days later, and it decides whether a real Safe indexer sees the owners and threshold a safe was created with. The case exists partly to make that difference measurable, so a tool recording 0 of the 10,524 `SafeSetup` rows is reporting a design choice, not a bug, and the note under the results table says so.

Every implementation here is written the way that tool's own documentation recommends. None of them is nudged toward or away from capturing the setup events.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **Rindexer** — [rindexer/](./rindexer/)
- **Sqd** — [sqd/](./sqd/)
- **Subgraph** — [subgraph/](./subgraph/) (requires Docker)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth, and an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Sqd implementation.

```bash
ENVIO_API_TOKEN=your-token SQD_API_KEY=your-key node cases/safe-factory-registrations/run.ts
```

Each indexer indexes the range to completion — its database is then checked against `expected.json` and measured — before re-running the same range for the throughput window. Indexers too slow to finish it within that window skip the re-run and report their rate from the verification run.

The verification phase allows 1,800 seconds here rather than the usual 900. The range is sixty thousand blocks, two hundred thousand events and two hundred thousand contract registrations, and a tool that runs out of time reports "could not verify", which would say nothing about the tool.

Unlike the other cases, the throughput window stops at a fixed block rather than at the chain head. Safe's deployment traffic comes in bursts, and these 60,000 blocks hold the canonical factories' creations at 3.3 per block, against a tenth of that density for the next 340,000. Running to the head would spend most of the window scanning near-empty blocks — a measure of how fast an indexer skips, not of how it copes with a contract set growing underneath it. The fastest indexers reach the end block before the window closes, and their rate is computed over the time it took.

The throughput window defaults to 60 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/safe-factory-registrations/run.ts --duration=60
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/safe-factory-registrations/run.ts envio ponder subquery
```

### Ground truth

`expected.json` holds a row count and a checksum per entity. It is built in two passes — the factories' own logs, then the logs of the children those announced — so the child set comes from the chain rather than from a list. Regenerate it after changing the range, the contracts, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts safe-factory-registrations
```

## Implementation Notes

All indexers share port `19876` for their GraphQL endpoint. A local run benchmarks them one after another and CI gives each its own runner, so there is no conflict.

### Envio

Runs natively via `envio start -r`, which resets the database on each start. Hasura is disabled (`ENVIO_HASURA=false`) since the benchmark reads PostgreSQL directly.

The two factory generations are two contracts in `config.yaml`, `SafeProxyFactory` and `SafeProxyFactoryModern`, each with its own event signature and address list. The `Safe` contract is declared with no address; `indexer.contractRegister` supplies one per `ProxyCreation`, from either factory. The `envio-rpc` variant forces RPC mode for historical sync (`ENVIO_RPC_FOR=sync`) instead of HyperSync.

### Ponder

Runs natively via `ponder start` backed by a Postgres container. The child contract is declared with `factory({ address, event, parameter })`, which resolves the child address set from the factory's logs before matching child logs against it.

A `factory()` reads one event layout, so there are two child declarations — `Safe` for the children of the 1.3.0 factories and `SafeModern` for those of 1.4.1 and 1.5.0 — writing to the same table.

### Rindexer

Skipped, and published as a row of dashes with the reason. Two parts of the case are out of reach:

A contract's `factory` filter takes one factory. Giving each canonical Safe deployment its own `details` block panics on startup with `Contract using factory filter must use same factory across all networks`, and giving each its own contract produces a second set of identically named tables in another schema, which table resolution rejects as ambiguous rather than guessing between. Only the v1.3.0 pair is reachable that way, leaving the children of v1.4.1 and v1.5.0 unindexed.

`include_events` also names an event once, so there is nowhere to put the second decode for the eight events that arrive under one topic0 in two layouts.

`rindexer.yaml` is kept at the closest configuration rindexer can express, with both limits written down beside it.

### Sqd (Subsquid)

Runs the processor and GraphQL server as separate native Node.js processes, with a Docker Postgres for storage.

Both factory generations share a topic0, so one subscription covers all four addresses and the handler picks a decoder from the address the log came from.

There is no address list to give the processor for the children, so `SafeSetup` is subscribed to by topic chain-wide and the handler drops logs from proxies these factories did not create — the pattern SQD's own factory-contract guide describes. The set of known proxies is built as the batch is walked, in chain order.

Sqd ingests from the SQD archive (`v2.archive.subsquid.io`), which requires an API key as of 19 May 2026. Set `SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it the processor fails with `CREDENTIALS_INVALID` and indexes nothing.

### Subgraph (Graph Node)

Runs a pinned `gnd` binary against its own Postgres container. The proxy is
indexed through a `Safe` template instantiated per `ProxyCreation` with
`SafeTemplate.create(proxy)`.

A data source carries a single address, so there is one per factory deployment —
four in all, two per ABI, sharing a pair of handlers.

Only the factory data sources carry the block range: a template may not declare
`startBlock` or `endBlock`, so Graph Node has no end block for the children it
creates and keeps following them past the range. The run still stops on the
event and block targets the harness watches — the process is killed rather than
exiting on its own, as with several of the other drivers.

### SubQuery

Runs entirely via Docker Compose (postgres + subquery-node), and carries the heaviest startup overhead — see the [Decoded Event Stream](../erc20-transfer-events/README.md) notes, which apply unchanged.

As with the subgraph, a datasource carries one address, so each factory deployment gets its own. The proxy is indexed through a `Safe` template instantiated per `ProxyCreation` with `createSafeDatasource({ address })`.

Its child ABI declares the 1.4.x layout of the eight overloaded events and not the older one: SubQuery resolves an event from its topic0 with an ethers `Interface`, which treats two fragments sharing a topic0 as ambiguous and would then decode neither. A log of the older layout still reaches the handler, arrives with `args` undefined, and is skipped rather than throwing.
