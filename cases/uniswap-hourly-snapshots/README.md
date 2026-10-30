# Time-Based Snapshots

Index the Uniswap V3 USDC/WETH 0.3% pool on Ethereum Mainnet from block 21,000,000, and keep an hourly snapshot of its price: the data behind an hourly price chart, or anything else read at a fixed time rather than when something happened.

A snapshot is time-based, not event-based. An hour without a swap still gets a row, carrying the price forward, so the indexer has to act on blocks rather than on the pool's events. And because blocks do not land on the hour, it has to read every block's timestamp to know which hour a block belongs to.

## Benchmark Specification

- **Target Contract**: Uniswap V3 USDC/WETH 0.3% pool (`0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8`)
- **Events Indexed**: Swap
- **Block Handler**: every block, reading its timestamp
- **Block Range**: 21,000,000 to latest
- **Verification Range**: 21,000,000 to 21,199,999 — about four weeks: 11,959 swaps and 671 hourly snapshots, 31 of them for hours without a swap, indexed to completion, then checked against `expected.json`
- **Features**: `event decoding`, `block handler`, `block field selection`, `storage update on conflict`

## Case Logic

For each **Swap** event:

1. Set the pool's state to the swap's `sqrtPriceX96` and `tick`.
2. Insert a swap record with `amount0`, `amount1` and the block timestamp.

For each **block**, after that block's swaps:

1. If the pool has not swapped yet in the range, do nothing.
2. Otherwise, upsert the snapshot for the UTC hour the block's timestamp falls in (`timestamp - timestamp % 3600`) with the block number and the pool's current price and tick.

The snapshot is overwritten by every block of its hour, so it ends up holding the pool as of the hour's last block, its close. The hour the range ends in is closed by the range's last block.

This is the hourly close the [Uniswap V3 subgraph](https://github.com/Uniswap/v3-subgraph)'s `PoolHourData` and [Messari](https://github.com/messari/subgraphs)'s `LiquidityPoolHourlySnapshot` keep, except that both build it from the pool's events, so an hour without one has no row. Filling those hours is what needs the block handler, and the pool is the quieter of the two USDC/WETH pools for that reason: on the 0.05% pool every hour of the range has a swap, so an implementation that never read a block would still get every price right.

Only price and tick are snapshotted because only swaps move them. In-range liquidity also changes on Mint and Burn, depending on where the position sits relative to the current tick, and tracking that would make the case about Uniswap rather than about block handlers.

Swaps are stored only so progress can be tracked by rows. Snapshots are too few to do that, and the last of them stays incomplete until the range's final block.

## Implementations

- **Envio** — [envio/](./envio/)

Other tools are not implemented yet.

## Running the Benchmark

Requires Node 23.6+, Docker, and an [Envio](https://envio.dev) API token for the RPC endpoint and ground truth.

```bash
ENVIO_API_TOKEN=your-token node cases/uniswap-hourly-snapshots/run.ts envio envio-rpc
```

### Ground truth

`expected.json` is built from the pool's Swap logs and the timestamp of every block in the range, both read from HyperSync, by replaying the case logic above. Regenerate it after changing the range, the pool, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts uniswap-hourly-snapshots
```

## Implementation Notes

### Block handler ordering

Where a tool runs a block's handler relative to that block's events decides how it implements the snapshot:

- **Envio**, **Graph Node** ([documented](https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/)) and **Ponder** (block events sort after every log of their block) run block handlers last, so the block handler alone can write the snapshot.
- **SubQuery** runs block handlers first. Its snapshot would miss the swaps in an hour's last block, so the Swap handler has to write the hour's row too.

Built-in time triggers do not fit either: SubQuery's `timestamp` cron filter and Sentio's `onTimeInterval` fire at the first block past each tick, which is the start of an hour rather than its close.

### Envio

`indexer.onBlock` with `fields: { block: ["timestamp"] }` runs on every block and fetches only that one column. HyperIndex runs a block's handlers after its events, so the snapshot sees the block's swaps. `onBlock` has no time-based filter, only block-number ranges and a block stride, so the handler runs on every block and rewrites the hour's row each time.
