## Carbon SPL Token Transfers

Indexes every USDC transfer made through the SPL Token program on Solana, one
row per instruction, into Postgres.

### Datasource

`RpcBlockCrawler` — the only Carbon 2 datasource that takes a bounded slot
range. Geyser gRPC and `blockSubscribe` follow the head; the transaction
crawler walks backwards from it by signature; `jetstreamer` is slot-ranged but
stayed on Carbon 1 and is not built in the Carbon 2 workspace.

It fetches every block in the range whole, so unlike the other implementations
of this scenario nothing about the mint narrows what arrives — that is the
shape of RPC indexing, and it is what the row measures. Concurrency and the
block interval are left at Carbon's defaults; the block config asks for base64
encoding, no rewards, and version 0 support, which is what keeps the payload to
what the decoder needs.

### Mint resolution

`transferChecked` names its mint, so it is decided on the instruction alone.
Plain `transfer` names none, so the transaction's token balances decide: either
account answers it, because SPL Token rejects a transfer between different
mints, and reading only the source would lose the transfers whose source the
transaction itself opened.

Token balances index accounts by position, so the lookup rebuilds the
transaction's key list the way Solana does — the message's own keys, then the
writable and readonly addresses its lookup tables loaded. Without the second
half a transfer whose account came from a lookup table would look like a
transfer of some other token.

### Writes

Rows go to a writer task over a channel, which inserts them in batches of 500
or every 250ms, whichever comes first. Carbon's own `PostgresInstructionProcessor`
upserts one row per instruction; at this scenario's rate that would measure
round trips rather than Carbon. The channel also gives the run an end: a
`Processor` has no end-of-stream hook, so the last partial batch would
otherwise sit in memory unwritten.

### Run

```bash
cargo build --release
docker compose up -d
SOLANA_RPC_URL=https://your-archive-endpoint \
DATABASE_URL=postgres://postgres:postgres@localhost:25432/carbon \
START_SLOT=440000000 END_SLOT=440001999 \
  ./target/release/carbon-solana-spl-transfers
```

The endpoint has to be an archive node: the range is roughly five million slots
behind the head, which a default-retention node no longer holds. Keys usually
live in the URL, so keep yours in `.env`, which is gitignored.

### Pins

`carbon-core`, `carbon-rpc-block-crawler-datasource` and
`carbon-token-program-decoder` are pinned to exactly `2.0.0` with `Cargo.lock`
committed, so the row names the version it measured.

Carbon's crates span two generations of the `solana-*` types — the block
crawler is on 4.x while `carbon-core`'s transaction metadata is on 2.x — so
this crate names only the types it hands to the crawler and compares everything
else as text.
