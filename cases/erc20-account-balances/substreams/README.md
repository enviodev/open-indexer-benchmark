## Substreams: State Aggregation

Transfers and approvals of one rETH contract, plus the balances and allowances
they add up to, into Postgres via `substreams-sink-sql`.

### Shape

Two store modules do the aggregating: `store_balances` is a `StoreAddBigInt`
credited on `to` and debited on `from`, and `store_allowances` a
`StoreSetBigInt`, because `Approval` reports the new figure rather than a
delta so the last one wins.

**Every module declares `initialBlock: 18600000`.** A store otherwise
accumulates from its initial block, which defaults to genesis — 18.6 million
blocks of state to prepare before the first row, and a different question
answered. The scenario's balances are the ones its range produces, which is
how every other implementation computes them.

**`db_out` follows each delta's own operation.** A store delta carries both
the value a key now holds and whether it held anything before; the sink turns a
create into an `INSERT` and an update into an `UPDATE`. Writing every
aggregate row as an update leaves the tables empty, and writing every one as a
create collides the second time a key changes.

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

