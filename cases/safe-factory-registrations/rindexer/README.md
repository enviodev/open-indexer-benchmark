# Rindexer Safe Factory Benchmark

[rindexer](https://rindexer.xyz/) indexing the Safe proxy factories on Ethereum
Mainnet: every `ProxyCreation` from the four canonical deployments, and the
fifteen events the created proxies emit, aggregated into the tables the case
verifies.

This case was long marked unsupported for rindexer. That verdict was written
for a **no-code** project, where it is real: table names derive from event
names (so the two-layout events can't get two tables), and the whole protocol
had to fit one contract. A **rust** project owns its handlers and tables, which
dissolves both constraints — the protocol is expressed as eight contracts, and
every handler writes one hand-owned table set in the `safe_case` schema:

- **Two factory generations.** The 1.3.0-era factories emit
  `ProxyCreation(address proxy, address singleton)` with everything in the
  payload; 1.4.1 indexed `proxy`, same topic0. Child extraction needs the right
  ABI per generation, so each generation gets its own factory definition (the
  two addresses within a generation share one).
- **Ten dual-layout child events.** Safe 1.4.x made one argument of ten child
  events `indexed` without changing the signature — one topic0, two layouts —
  and a proxy can emit either (it can be re-pointed at another singleton after
  creation). Each layout is registered as its own contract; a log decodes under
  exactly one, so together they capture everything with no duplicates. The
  five events whose layout never changed live in one Common registration per
  generation.
- **Factory-sync registrations.** rindexer only builds the pipeline that
  discovers and registers a factory's children when the factory event itself is
  registered, so each child contract's `ProxyCreation` gets a no-op handler —
  the bookkeeping happens inside rindexer after the callback. rindexer keys the
  implicit child-after-factory ordering by factory name, and the same name on
  several contracts is unsupported, so each child contract names its factory
  uniquely.

## Hand-edits on top of `rindexer codegen` output

If the typings are ever regenerated, re-apply these (all marked with
"Hand-" comments):

- `typings/networks.rs` — the HyperSync provider and the `RINDEXER_HYPERSYNC`
  dispatch (one binary backs both benchmark rows), and a 2,000-block request
  cap: with `address_filtering: in-memory` every request is topic-only, and
  the upstream RPC rejects `eth_getLogs` responses above 50,000 logs.
- `typings/safeindexer/events/child_*_layout_*.rs` — the generated typed
  callback panics when part of a batch fails to decode. For the dual-layout
  registrations a mixed batch is the design, so they process the decodable
  subset instead.

## Pre-requisites

- A Rust toolchain ([rustup](https://rustup.rs))
- [Docker](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

## Setup

1. Start PostgreSQL:

```bash
docker compose up -d
```

2. Copy the `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your RPC endpoint
```

## Run

```bash
cargo build --release
./target/release/safe-indexer --indexer
```

The HyperSync row needs rindexer v0.43.0+ (the crate this project pins) and an
`ENVIO_API_TOKEN`; set `RINDEXER_HYPERSYNC=true` to switch the data source.
