# Rindexer — External Contract Calls

A `rust` project: `no-code` describes table operations declaratively and cannot
call a contract from a handler at all.

[`src/rindexer_lib/indexers/erc_20indexer/erc_20.rs`](./src/rindexer_lib/indexers/erc_20indexer/erc_20.rs)
is the one hand-written file. It gets the whole batch, issues the allowance
reads together with `join_all`, and writes the case's two tables itself —
codegen's event table has no column for an allowance that is not in the log.
Everything else under `src/rindexer_lib` is `rindexer codegen` output.

See the [case README](../README.md) for the scenario and the shared rules.

```bash
cargo build --release
docker compose up -d
RINDEXER_END_BLOCK=25601199 ETHEREUM_RPC=<endpoint> ./target/release/erc20indexer --indexer
```
