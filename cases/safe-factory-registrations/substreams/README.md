## Substreams: Factory Contract Registration

Every Safe proxy these factories create, and the events those proxies go on to
emit, into Postgres via `substreams-sink-sql`.

### Shape

`store_proxies` holds the proxies the factories have announced, and it is
written by a module that runs before the one reading it on the same block. That
ordering is the point of the scenario: a Safe emits its own `SafeSetup` one
log index *below* the `ProxyCreation` announcing it, so an implementation that
registers children strictly in event order loses those rows.

Two decoding quirks the case demands:

- `ProxyCreation` carries one topic0 across two layouts — proxy in the payload
  before 1.4.1, in a topic after — so the factory that emitted the log decides
  how to read it.
- The eight events that carry one address and nothing else moved that argument
  into a topic in 1.4.x, so an empty payload is the tell. They share one branch
  that names the table and the column rather than repeating the shape.

Column names follow what the case's entity specs ask for, `to` included:
resolving a table is what the harness reads progress through, so a column named
around a SQL keyword makes a run report that it indexed nothing.

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

