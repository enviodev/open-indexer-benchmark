# Open Indexer Benchmark

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

An open and honest benchmark for blockchain indexers. Every number below comes from code in this repository, so you can run it yourself and check, and the tables are refreshed automatically by scheduled CI runs.

If you want to know how the numbers are produced, or what a column means, that is all in [METHODOLOGY.md](./METHODOLOGY.md).


## History

The benchmark started in May 2025 as a fork of [Sentio](https://sentio.xyz)'s research. That repository was later closed, so [Envio](https://envio.dev) picked it up and has kept it current since. We are not affiliated with Sentio, and although the project now lives under the Envio organisation — its data is what the [Envio landing page](https://envio.dev) and the [Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026) article cite — the point of it is a fair comparison.


## Contributing

Contributions are welcome — we already have some from the [SQD](https://sqd.dev) team. Open an issue or a pull request to add an indexer, add a scenario, report a result that looks wrong, or improve the methodology. Indexer teams especially: nobody knows your tool better than you do. Or just come and ask on [Discord](https://discord.com/invite/envio) or [Telegram](https://t.me/+kAIGElzPjApiMjI0).


## Scenarios

### Reliability

What does an indexer do when something goes wrong? These scenarios restart its database mid-write, rewrite the chain underneath it, make the node it reads from fail, and hand it values that are legal but awkward, then check what ended up in the database. They also time how long a new block takes to become readable. Every check runs on a generated chain, so no credentials are needed.

<!-- RELIABILITY:START -->
| tool | [source](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | [crash recovery](./reliability/README.md#crash-recovery) | [reorgs](./reliability/README.md#reorgs) | [rpc faults](./reliability/README.md#rpc-faults) | [data fidelity](./reliability/README.md#data-fidelity) | [head latency](./reliability/README.md#head-latency) | overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | 19/19 ✅ | 6/6 ✅ | 6/6 ✅ (p50 232ms, p99 327ms, WS) | **50 / 50** |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | **16/19** 🔴 | 6/6 ✅ | 6/6 ✅ (p50 236ms, p99 250ms, WS) | **47 / 50** |
| [Squid SDK](https://sqd.dev/sdk/) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | **15/19** 🔴 | 6/6 ✅ | 6/6 ✅ (p50 575ms, p99 836ms, WS) | **46 / 50** |
| [Ponder](https://ponder.sh) | RPC | **8/9** 🔴 (no restarts) | 8/8 ✅ | **17/19** 🔴 | **5/6** 🔴 | 6/6 ✅ (p50 260ms, p99 438ms, WS) | **44 / 48** |
| [Subgraph](https://thegraph.com) | RPC | **7/10** 🔴 (no restarts) | 8/8 ✅ | **15/17** 🔴 | 6/6 ✅ | **5/6** 🔴 (p50 8.6s, p99 11.2s) | **41 / 47** |
| [SubQuery](https://subquery.network) | RPC | 11/11 ✅ (no restarts) | **0/8** 🔴 | 17/17 ✅ | 6/6 ✅ | **5/6** 🔴 (p50 3.8s, p99 6.5s) | **39 / 48** |
| [Rindexer](https://rindexer.xyz) | RPC | 11/11 ✅ (no restarts) | **1/8** 🔴 | **10/17** 🔴 | 6/6 ✅ | **4/6** 🔴 (p50 18.2s, p99 34.0s) | **32 / 48** |

<details>
<summary>What failed, and what it means for you - 42 failing checks across 6 tools</summary>

- **Envio Subgraph**
  - *rpc faults*
    - **Missing data**: skips events in blocks an RPC node briefly answered as empty
    - **Missing data**: skips events in blocks an RPC node answered from the branch a reorg replaced
    - **Missing data**: skips events in blocks an RPC node left out of the middle of a range
- **Squid SDK**
  - *rpc faults*
    - **Stops indexing**: crashes when the RPC node errors or times out
    - **Stops indexing**: does not resume after the RPC node recovers
    - **Stops indexing**: crashes when the RPC provider fails some of its requests
    - **Stops indexing silently**: stops following the chain when its block subscription goes quiet
- **Ponder**
  - *crash recovery*
    - **Stops indexing**: never recovers after the database restarts mid-sync
    - <i>not tested: keeps picking up new blocks after the database restarts</i>
    - <i>not tested: recovers by itself when an unresponsive database comes back</i>
  - *rpc faults*
    - **Missing data**: deletes rows when an RPC node briefly reports an older block
    - **Stops indexing silently**: stops following the chain when its block subscription goes quiet
  - *data fidelity*
    - **Missing data**: drops events with very large log indexes, which some providers emit
- **Subgraph**
  - *crash recovery*
    - **Stops indexing**: never recovers after the database restarts mid-sync (only 1 of 3 runs)
    - **Stops indexing**: stops picking up new blocks after the database restarts
    - **Slow deploys**: ignores the shutdown signal for over 15 seconds and gets force-killed
    - <i>not tested: recovers by itself when an unresponsive database comes back</i>
  - *rpc faults*
    - **Stops indexing**: does not resume after the RPC node recovers
    - **Wrong balances**: counts a transfer twice when the RPC node sends it twice (only 1 of 3 runs)
    - <i>not tested: keeps following the chain when its block subscription goes quiet</i>
    - <i>not tested: fills in the blocks it was never told about</i>
  - *head latency*
    - **Stale reads**: on a real chain's traffic, new data sometimes takes over 10 seconds to show up
- **SubQuery**
  - *reorgs*
    - **Stale data**: keeps an event after the chain replaced its block
    - **Stale data**: keeps blocks from a fork the chain abandoned for a shorter one
    - **Stale data**: keeps an event the chain removed
    - **Missing data**: skips events a reorg put into blocks it had read as empty
    - **Wrong data**: carries on after a chain rewrite deeper than it can undo, instead of stopping
    - **Stale data**: misses a chain rewrite that happened while it was offline
    - **Wrong data**: loses track when the chain rewrites several times in a row
    - **Stale data**: misses a chain rewrite in blocks it was still syncing
  - *rpc faults*
    - <i>not tested: keeps following the chain when its block subscription goes quiet</i>
    - <i>not tested: fills in the blocks it was never told about</i>
  - *head latency*
    - **Stale reads**: new data usually takes longer than one block to show up
- **Rindexer**
  - *reorgs*
    - **Stale data**: keeps an event after the chain replaced its block
    - **Stale data**: keeps blocks from a fork the chain abandoned for a shorter one
    - **Stale data**: keeps an event the chain removed
    - **Missing data**: skips events a reorg put into blocks it had read as empty
    - **Wrong data**: carries on after a chain rewrite deeper than it can undo, instead of stopping
    - **Wrong data**: loses track when the chain rewrites several times in a row
    - **Stale data**: misses a chain rewrite in blocks it was still syncing
  - *rpc faults*
    - **Stops indexing**: does not resume after the RPC node recovers
    - **Stops indexing**: never catches up after a spell of flaky RPC
    - **Stops indexing**: cannot cope with a provider's response-size limit
    - **Wrong balances**: counts a transfer twice when the RPC node sends it twice
    - **Missing data**: skips events in blocks an RPC node briefly answered as empty
    - **Missing data**: skips events in blocks an RPC node answered from the branch a reorg replaced
    - **Missing data**: skips events in blocks an RPC node left out of the middle of a range
    - <i>not tested: keeps following the chain when its block subscription goes quiet</i>
    - <i>not tested: fills in the blocks it was never told about</i>
  - *head latency*
    - **Stale reads**: on a real chain's traffic, new data sometimes takes over 10 seconds to show up
    - **Falls behind**: cannot keep up with a real chain's block rate over a network

</details>
<!-- RELIABILITY:END -->

Each cell is the checks a tool passed out of the checks it was asked. The number in brackets is a measurement beside the score, not part of it.

[What every check means, and how to run it →](./reliability/README.md)


### State Aggregation

How well does an indexer cope with data it has to read back? Every rETH transfer changes a balance, so for each one the indexer has to find the right row, update it, and save it again. The scenario follows the benchmark on the [Ponder landing page](https://ponder.sh).

<!-- BENCHMARK:erc20-account-balances:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 13,202.3 | 96,188.2 | — | ✅ | ClickHouse 748 KB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 13,003.8 | 94,742.0 | — | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 11,942.9 | 87,012.6 | 1.1x slower | ✅ | Postgres 2.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,001.7 | 23,950.9 | 4.4x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,228.3 | 16,912.2 | 5.9x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 593.0 | 4,349.9 | 22.3x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 312.1 | 1,757.0 | 42.3x slower | ✅ | Postgres 5.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 268.4 | 2,356.1 | 49.2x slower | ✅ | Postgres 2.3 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 65.4 | 861.0 | 201.9x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 45.2 | 595.4 | 292x slower | ✅ | Postgres 6.9 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 460x slower | ✅ | Postgres 2.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.3 | 332.6 | 522.4x slower | ❓ (1) | Postgres ~4.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 22.8 | 291.2 | 579.2x slower | ❓ (2) | Postgres ~2.3 MB |

> **(1)** SubQuery — missing 0.08% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK — missing 9.9% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

How fast can an indexer write? Every USDC transfer is stored once, with nothing to aggregate and nothing to look up first. This is the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 87,205.8 | 9,178.0 | — | ✅ | Postgres 3.4 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 83,352.5 | 8,819.9 | — | ✅ | ClickHouse 484 KB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 80,565.9 | 8,574.1 | 1.1x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 36,359.1 | 3,918.4 | 2.4x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 31,906.9 | 3,539.4 | 2.7x slower | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 24,522.4 | 2,766.3 | 3.6x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 12,987.8 | 1,546.7 | 6.7x slower | ✅ | Postgres 1.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 32.9x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,523.4 | 295.3 | 34.6x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,311.5 | 166.8 | 66.5x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 228.4 | 29.1 | 381.8x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 196.3 | 25.1 | 444.2x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 47.2 | 5.9 | 1847.1x slower | ✅ | Postgres 2.0 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval on the eight busiest ERC-20s is followed by a read of the allowance at that block: 15,703 calls, 200ms each, answered by the benchmark so every tool waits the same. Nothing limits how many a tool may have outstanding, so the rows differ by how many of those waits it takes at once.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 14,734.8 | 968.9 | — | ✅ | ClickHouse 2.1 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 13,410.7 | 885.4 | 1.1x slower | ✅ | Postgres 8.5 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 12,392.9 | 817.0 | 1.2x slower | ✅ | Postgres 8.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,584.5 | 690.9 | 1.4x slower | ✅ | Postgres 8.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,766.4 | 497.9 | 1.9x slower | ✅ | Postgres 7.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,737.9 | 496.1 | 1.9x slower | ✅ | Postgres 7.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,085.4 | 147.8 | 7.1x slower | ✅ | Postgres 8.5 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,000.5 | 55.0 | 14.7x slower | ✅ | Postgres 8.5 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 875.1 | 46.4 | 16.8x slower | ✅ | Postgres 8.4 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 72.0 | 4.5 | 204.6x slower | ✅ | Postgres 20.1 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 36.0 | 2.5 | 409.2x slower | ❓ (1) | Postgres ~11.7 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.5 | 0.3 | 3266.3x slower | ❓ (2) | Postgres ~16.5 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (3) | — |

> **(1)** Ponder — missing 43% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 93% of the data: the verification range was not finished within 300s
> **(3)** Substreams — its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? The indexer watches the Safe proxy factories, and every one of the 82,268 proxies they create becomes another contract it has to follow from that moment on.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 14,240.9 | 5,027.3 | — | ✅ | ClickHouse 3.9 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 14,122.8 | 4,985.6 | — | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 11,821.6 | 4,173.3 | 1.2x slower | ✅ | Postgres 14.0 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 10,668.0 | 3,766.0 | 1.3x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8,155.1 | 2,878.9 | 1.7x slower | ✅ | Postgres 11.4 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,860.5 | 2,774.9 | 1.8x slower | ✅ | Postgres 11.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,586.7 | 1,266.2 | 4x slower | ✅ | Postgres 14.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 3,518.5 | 1,258.8 | 4x slower | ❌ (1) | Postgres 13.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 388.3 | 137.1 | 36.7x slower | ❌ (2) | Postgres 13.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 289.2 | 102.1 | 49.2x slower | ✅ | Postgres 25.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 53.4x slower | ❓ (3) | Postgres ~14.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 54.6 | 24.4 | 260.8x slower | ❓ (4) | Postgres ~36.5 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (5) | — |

> **(1)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(3)** Substreams — missing 5.6% of the data: the verification range was not finished within 300s
> **(4)** Subgraph — missing 81% of the data: the verification range was not finished within 300s
> **(5)** SubQuery — indexed nothing in 300s, so there was no data to verify
<!-- BENCHMARK:safe-factory-registrations:END -->

[How this case works, and how to run it →](./cases/safe-factory-registrations/README.md)


### Time-Based Snapshots

Some data is read at a fixed time rather than when something happens. The indexer keeps an hourly price snapshot of the Uniswap V3 USDC/WETH 0.3% pool, including the hours nobody traded, so it has to act on every block, not just the pool's events.

<!-- BENCHMARK:uniswap-hourly-snapshots:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 28,975.4 | 27,029.7 | — | ✅ | Postgres 1.3 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 26,193.0 | 24,526.0 | 1.1x slower | ✅ | ClickHouse 2.6 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,916.3 | 2,744.0 | 9.9x slower | ✅ | Postgres 1.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 239.5 | 3,908.3 | 121x slower | ✅ | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 107.5 | 1,798.0 | 269.5x slower | ❓ (1) | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 70.7 | 1,182.5 | 409.8x slower | ✅ | Postgres 1.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 9.2 | 231.9 | 3159.3x slower | ❓ (2) | Postgres ~1.7 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3.2 | 103.1 | 8942.5x slower | ❓ (3) | Postgres ~4.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.8 | 37.8 | 34581.4x slower | ❓ (4) | Postgres ~95.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.6 | 32.3 | 47311.2x slower | ❓ (5) | Postgres ~262 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | — | — | — | — (6) | — |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | — | — | — | — (7) | — |

> **(1)** Envio Subgraph — missing 43% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK — missing 77% of the data: the verification range was not finished within 300s
> **(3)** Ponder — missing 92% of the data: the verification range was not finished within 300s
> **(4)** SubQuery — missing 98% of the data: the verification range was not finished within 300s
> **(5)** Subgraph — missing 98% of the data: the verification range was not finished within 300s
> **(6)** Rindexer — it has event handlers only, so it cannot act on a block without an event
> **(7)** Rindexer — it has event handlers only, so it cannot act on a block without an event
<!-- BENCHMARK:uniswap-hourly-snapshots:END -->

[How this case works, and how to run it →](./cases/uniswap-hourly-snapshots/README.md)


### Solana USDC Transfers

Every USDC transfer on Solana, through the chain's busiest program. Solana makes that harder than it sounds: transfers hide inside swaps and routers, and many never say which token they moved. The scenario follows StreamingFast's [SPL token Substreams](https://github.com/streamingfast/substreams-solana-spl-token).

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 27,955.1 | 445.7 | — | ✅ | Postgres 37.8 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 24,685.8 | 387.1 | 1.1x slower | ✅ | ClickHouse 13.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 7.2x slower | ✅ | Postgres 62.7 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 49.6x slower | ✅ | Postgres 40.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 555.0 | 18.6 | 50.4x slower | ✅ | Postgres 37.9 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | — | — | — | — (1) | — |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | — | — | — | — (2) | — |

> **(1)** Envio Indexer — HyperIndex indexes Solana instructions through HyperSync only
> **(2)** Squid SDK — SQD serves Solana through its Portal, not RPC
<!-- BENCHMARK:solana-spl-transfers:END -->

[How this case works, and how to run it →](./cases/solana-spl-transfers/README.md)


## Sentio Benchmark Cases, May 2025

Six scenarios from the original 2025 research, kept here for reference. They are total sync times rather than throughput rates, and they predate the current methodology, so do not compare them with the tables above.

| Case                   | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio_Subgraph | Goldsky_Subgraph |
| ---------------------- | ------ | --------------- | ---------------- | ------ | -------- | -------- | --------------- | ---------------- |
| case_1_lbtc_event_only | 8m     |                 | 3m               | 1h40m  | 10m      | 3h9m     | 2h36m           |                  |
| case_2_lbtc_full       | 6m     |                 | 1m               | 45m    | 34m      | 1h3m     | 56m             |                  |
| case_3_ethereum_block  | 18m    | 7.9s            |                  | 33m    | 1m‡      | 10m      | 15m             |                  |
| case_4_on_transaction  | 17m    | 1m26s           |                  | 33m    | 7m       | N/A      |                 |                  |
| case_5_on_trace        | 16m    | 41s             |                  | N/A§   | 2m       | 8m       | 1h21m           |                  |
| case_6_template        | 19m    |                 | 8s               | 21m    | 2m       | 19m      | 10m             | 20h24m           |

[More about these cases →](./sentio-benchmarks-may-2025/README.md)


## Running the benchmarks

Want to try it yourself? Each scenario page above has its own setup instructions, or you can run the whole suite the way CI does:

```bash
ENVIO_API_TOKEN=your-token SQD_API_KEY=your-key node scripts/run-benchmarks.ts
```

Arguments are passed straight through, so `node scripts/run-benchmarks.ts envio ponder --duration=100` picks which indexers to run and how long the window is, and `--cases=erc20-transfer-events` narrows it to one scenario. You will need an [Envio](https://envio.dev) API token for the RPC endpoint and the ground truth; the [SQD](https://portal.sqd.dev) key is only needed for the Squid SDK run that reads from SQD Network.
