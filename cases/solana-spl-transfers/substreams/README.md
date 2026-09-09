## Substreams SPL Token Transfers

Indexes every USDC transfer made through the SPL Token program on Solana, one
row per instruction, into Postgres via `substreams-sink-sql`.

### Datasource

StreamingFast, through `solana-common`'s `transactions_by_programid_without_votes`,
so the filter down to the Token program happens server-side and the module
never sees a block it does not need. That is the shape of Substreams indexing,
and it is what the row measures.

The endpoint bills by the request and needs an API key, so this row is measured
by hand rather than in CI — see the case README.

### Relationship to the upstream package

Follows [`streamingfast/substreams-solana-spl-token`](https://github.com/streamingfast/substreams-solana-spl-token)
in shape: `map_transfers` into `db_out`, the same `token_contract:<mint>`
parameter, and the same source module. Two deliberate differences.

**Decoding is upstream's, and better than writing it out.** Instructions are
unpacked with `spl_token::instruction::TokenInstruction`, the program's own
crate, so the wire format is not restated here.

**The unchecked mint rule is not upstream's.** A plain `transfer` names no
mint, and upstream asks whether *any* token balance in the transaction carries
it — which marks the SOL leg of a USDC swap as a USDC transfer, and whose
`|| token_balance.owner == contract` clause compares an account owner against a
mint address, so it cannot match. This module resolves the transfer's own two
accounts, reading pre- and post-balances together so an account opened inside
the transaction is still attributable. The case README sets out why that loses
nothing.

### Row identity

Rows are keyed on the transaction's signature and the instruction's path within
it, which is what the upstream package does (`evt_tx`, `evt_instruction_index`)
and what `solana-common`'s own instruction stream implies by carrying `tx_hash`
and no index at all.

The other three implementations key on `slot-transactionIndex-path`, which is
cheaper — a base58 signature is 88 characters against roughly 17 — and the
storage column shows it. The transaction's index within its block is not
recoverable here: the filtered stream hands over the transactions that touch
the Token program without the block they came from, and computing it would mean
asking for whole blocks, giving up the filter that is the point of Substreams.

### Flushing

`substreams-sink-sql` batches 1,000 blocks by default and **drops whatever is
pending when it reaches a stop block**, so a bounded run loses its tail. Over
this scenario's 4,000-slot range that was 29,723 of 119,152 transfers; over a
100-block range it wrote 25 rows of 2,914, having flushed only the first block.

A backfill is a bounded run, so this is the mode the benchmark measures rather
than an edge case of it. `--batch-block-flush-interval 1` is what makes it
complete, and it is what the driver passes.

It is not what makes the row slow. Normalised by the rows actually written,
over 2,000 slots: interval 1 wrote 60,175 rows in 18.1s (3,331 rows/s),
interval 100 wrote 56,441 in 13.8s (4,082 rows/s), and interval 1,000 wrote
30,928 in 9.2s (3,358 rows/s). The wall-clock differences are the incomplete
runs writing less, and what is left is run-to-run variance on a remote stream.
The bottleneck is upstream of the writes.

### Run

```bash
./fetch-tools.sh
cargo build --target wasm32-unknown-unknown --release
docker compose up -d
export SUBSTREAMS_API_KEY=your-key
./.bin/substreams-sink-sql setup \
  "postgres://postgres:postgres@localhost:25433/substreams?sslmode=disable" \
  ./substreams.yaml
./.bin/substreams-sink-sql run \
  "postgres://postgres:postgres@localhost:25433/substreams?sslmode=disable" \
  ./substreams.yaml 440000000:440004000 \
  -e mainnet.sol.streamingfast.io:443 \
  --undo-buffer-size 0 --final-blocks-only --batch-block-flush-interval 1
```

The key is a credential: keep it in `.env`, which is gitignored.

### Regenerating the protobuf bindings

```bash
substreams protogen ./substreams.yaml \
  --exclude-paths="sf/substreams,google,sf/solana/type,sf/firehose"
```

`sf/solana/type` is excluded because `buf.gen.yaml` maps it to
`::substreams_solana::pb::...`, so the crate's own Solana types are used rather
than a second copy; `sf/firehose` because nothing here reads it. Both need the
sink import commented out — see below.

### A note on the two CLIs

`substreams.yaml` imports the sink-sql protodefs spkg, because
`substreams-sink-sql` resolves the sink type from it and does not bundle the
descriptors. The `substreams` CLI *does* bundle them, so with the import
present its own commands fail on an ambiguous `sf.substreams.sink.sql.v1.Service`.
Comment the import out to run `substreams protogen` or `substreams run`, and
restore it for the sink.

### Pins

`substreams` and `substreams-sink-sql` are pinned in `fetch-tools.sh` and
downloaded into `.bin/`, which is gitignored — neither comes from a package
manager the benchmark already runs. The toolchain is `stable` rather than the
1.80 the upstream package pins, because a transitive dependency of `spl-token`
needs edition 2024.
