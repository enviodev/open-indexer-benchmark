# Rindexer — External Contract Calls

## The two benchmark rows

One crate backs both the `rindexer` (RPC) and `rindexer-hypersync` rows. In a
rust project the data source is baked into the generated
`src/rindexer_lib/typings/networks.rs` at codegen time, so that file carries
two documented hand-edits on top of the generated output:

- a HyperSync provider (mirroring exactly what `rindexer codegen` emits for a
  hypersync-enabled network, rindexer v0.43.0+), dispatched by the
  `RINDEXER_HYPERSYNC` variable the benchmark driver sets;
- a 2,000-block request cap on the RPC provider — the upstream RPC rejects
  `eth_getLogs` responses above 50,000 logs, and this case's eight tokens emit
  roughly 16 approvals a block, so an uncapped request never succeeds.

If the typings are ever regenerated, re-apply both (they are marked with
"Hand-" comments in the file).


A `rust` project: `no-code` describes table operations declaratively and cannot
call a contract from a handler at all.

[`src/rindexer_lib/indexers/erc_20indexer/erc_20.rs`](./src/rindexer_lib/indexers/erc_20indexer/erc_20.rs)
is the one hand-written file. It gets the whole batch, issues the allowance
reads together with `join_all`, and writes the case's two tables itself —
codegen's event table has no column for an allowance that is not in the log.
Everything else under `src/rindexer_lib` is `rindexer codegen` output, apart
from two documented hand-edits in `typings/networks.rs` (see below).

See the [case README](../README.md) for the scenario and the shared rules.

```bash
cargo build --release
docker compose up -d
RINDEXER_END_BLOCK=25601199 ETHEREUM_RPC=<endpoint> ./target/release/erc20indexer --indexer
```
