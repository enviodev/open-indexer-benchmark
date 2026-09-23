## Substreams: Decoded Event Stream

Every USDC `Transfer` in the range, one row each, into Postgres via
`substreams-sink-sql`.

### Shape

EVM has no filtered source module the way `solana-common` serves Solana, so
the module takes whole blocks and keeps the logs of one contract. That is what
Substreams gives you on this chain, and it is what the row measures: far more
data crosses the wire than the filtered sources ship.

A log is kept only if its shape matches a standard ERC-20 `Transfer` — three
topics and a single data word — so a non-standard event of the same name
decodes to nothing rather than to a wrong row.

Rows are keyed `blockNumber-logIndex`, the same as every other implementation
here, which is what keeps the storage column comparing indexers rather than
primary keys. The block for progress is read back out of that key rather than
stored again.

### Running it by hand

```bash
./fetch-tools.sh
cargo build --target wasm32-unknown-unknown --release
export SUBSTREAMS_API_KEY=your-key
D="postgres://postgres:postgres@localhost:25433/substreams?sslmode=disable"
./.bin/substreams-sink-sql setup "$D" ./substreams.yaml
./.bin/substreams-sink-sql run "$D" ./substreams.yaml <start>:<stop> \
  -e mainnet.eth.streamingfast.io:443 \
  --undo-buffer-size 0 --final-blocks-only --batch-block-flush-interval 1
```

`--batch-block-flush-interval 1` is not optional: the sink batches 1,000 blocks
by default and drops whatever is pending when it reaches a stop block, so a
bounded run — which a backfill is — silently loses its tail.

`substreams.yaml` imports the sink-sql protodefs spkg because the sink resolves
its type from there. The `substreams` CLI bundles them itself and then rejects
the pair as ambiguous, so comment the import out to run `substreams run` or
`substreams protogen`, and restore it for the sink.

The API key is a credential: keep it in `.env`, which is gitignored.

