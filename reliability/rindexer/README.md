# The reliability case, as a rust rindexer project

A `rust` project rather than `no-code`, so that it writes the one row the
others write from a contract read: the `token`, whose `symbol()` answers with
no data and whose `name` carries a byte Postgres will not store. Those are the
two data fidelity checks a no-code version of this project left unmeasured.

[`src/rindexer_lib/indexers/reliability/erc_20.rs`](./src/rindexer_lib/indexers/reliability/erc_20.rs)
is the one hand-written file. Everything else under `src/rindexer_lib` is
`rindexer codegen typings` and `rindexer codegen indexer` output from v0.43.3,
the tag `Cargo.toml` pins, and `src/main.rs` is the `rindexer new rust`
scaffold.

## What the handlers write

- **`transfer`** and **`metadata_updated`** - rindexer's own event tables, with
  the rows codegen's handlers insert: the decoded parameters beside the block
  number and log index every comparison against the chain needs.
- **`accounts`** - the running balance. A no-code project declares it under
  `tables:` in the yaml; a rust project's handlers are registered without that
  section, so the Transfer handler writes it.
- **`token`** - one row per token, written on its first transfer from a
  `symbol()` and a `name()` read. Returndata that is empty or does not decode,
  and a revert, are stored as a null; NUL bytes are removed. A node that fails
  the call fails the batch instead, and rindexer retries it - storing a null
  because the node was down would be a wrong row, not an awkward one.

## Each batch commits once

Every batch's event rows, balance changes and token row commit in one
transaction together with rindexer's last-synced cursor for the event. That is
what no-code rindexer does with its tables since v0.43.3, so a process killed
mid-batch re-reads the batch on restart rather than adding its transfers to
the balances a second time. The helper rindexer uses for this takes its
caller's transaction only inside the crate, so the handler runs the same
statements itself.

## Running it by hand

```bash
cargo build --release
docker compose up -d
ETHEREUM_RPC=<endpoint> ./target/release/reliabilityindexer --indexer
```

The harness does the same through the shared driver: it builds the crate while
preparing, and the reliability workflow builds it ahead of the run from a
cache so that preparing finds nothing left to compile.

If the typings are ever regenerated, only `erc_20.rs` under `indexers/` needs
keeping: codegen overwrites it with a handler that inserts the event rows and
nothing else.
