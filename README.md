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
| [Envio Indexer](https://envio.dev) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | 19/19 ✅ | 6/6 ✅ | 6/6 ✅ (p50 231ms, p99 254ms, WS) | **50 / 50** |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | **16/19** 🔴 | 6/6 ✅ | 6/6 ✅ (p50 236ms, p99 259ms, WS) | **47 / 50** |
| [Squid SDK](https://sqd.dev/sdk/) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | **15/19** 🔴 | 6/6 ✅ | 6/6 ✅ (p50 573ms, p99 834ms, WS) | **46 / 50** |
| [Subgraph](https://thegraph.com) | RPC | **9/11** 🔴 (no restarts) | 8/8 ✅ | **16/17** 🔴 | 6/6 ✅ | **5/6** 🔴 (p50 8.2s, p99 10.8s) | **44 / 48** |
| [Ponder](https://ponder.sh) | RPC | **8/9** 🔴 (no restarts) | 8/8 ✅ | **16/19** 🔴 | **5/6** 🔴 | 6/6 ✅ (p50 257ms, p99 426ms, WS) | **43 / 48** |
| [SubQuery](https://subquery.network) | RPC | 11/11 ✅ (no restarts) | **0/8** 🔴 | 17/17 ✅ | 6/6 ✅ | **5/6** 🔴 (p50 4.5s, p99 7.4s) | **39 / 48** |
| [Rindexer](https://rindexer.xyz) | RPC | 11/11 ✅ (no restarts) | **1/8** 🔴 | **12/17** 🔴 | 6/6 ✅ | **4/6** 🔴 (p50 34.6s, p99 39.2s) | **34 / 48** |

<details>
<summary>What failed, and what it means for you - 39 failing checks across 6 tools</summary>

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
- **Subgraph**
  - *crash recovery*
    - **Stops indexing**: never recovers after the database restarts mid-sync (only 2 of 3 runs)
    - **Slow deploys**: ignores the shutdown signal for over 15 seconds and gets force-killed
  - *rpc faults*
    - **Stops indexing**: does not resume after the RPC node recovers
    - <i>not tested: keeps following the chain when its block subscription goes quiet</i>
    - <i>not tested: fills in the blocks it was never told about</i>
  - *head latency*
    - **Stale reads**: on a real chain's traffic, new data sometimes takes over 10 seconds to show up
- **Ponder**
  - *crash recovery*
    - **Stops indexing**: never recovers after the database restarts mid-sync
    - <i>not tested: keeps picking up new blocks after the database restarts</i>
    - <i>not tested: recovers by itself when an unresponsive database comes back</i>
  - *rpc faults*
    - **Missing data**: deletes rows when an RPC node briefly reports an older block
    - **Wrong balances**: counts a transfer twice when the RPC node sends it twice (only 1 of 3 runs)
    - **Stops indexing silently**: stops following the chain when its block subscription goes quiet
  - *data fidelity*
    - **Missing data**: drops events with very large log indexes, which some providers emit
- **SubQuery**
  - *reorgs*
    - **Stale data**: keeps an event after the chain replaced its block (only 2 of 3 runs)
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
    - **Stale data**: keeps an event after the chain replaced its block (only 2 of 3 runs)
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
    - **Missing data**: skips events in blocks an RPC node answered from the branch a reorg replaced
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
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,175.1 | 89,377.6 | — | ✅ | ClickHouse 748 KB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 11,876.4 | 87,184.3 | — | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 11,385.3 | 83,579.1 | 1.1x slower | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 5,340.8 | 43,194.8 | 2.3x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,165.0 | 16,829.8 | 5.6x slower | ✅ | Postgres 5.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 366.7 | 2,303.4 | 33.2x slower | ✅ | Postgres 5.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 241.0 | 2,262.8 | 50.5x slower | ✅ | Postgres 2.2 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 65.7 | 864.5 | 185.5x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 47.3 | 622.7 | 257.5x slower | ✅ | Postgres 6.9 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 424.2x slower | ✅ | Postgres 2.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 19.5 | 245.6 | 625.4x slower | ❓ (1) | Postgres ~2.3 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 12.9 | 149.6 | 944.6x slower | ❓ (2) | Postgres ~5.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 2.9 | 26.5 | 4219.2x slower | ❓ (3) | Postgres ~4.1 MB |

> **(1)** Squid SDK — missing 23% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 49% of the data: the verification range was not finished within 300s
> **(3)** Squid SDK — missing 89% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

How fast can an indexer write? Every USDC transfer is stored once, with nothing to aggregate and nothing to look up first. This is the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 102,639.8 | 10,580.9 | — | ✅ | ClickHouse 489 KB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 98,742.8 | 10,225.1 | — | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 70,932.0 | 7,662.9 | 1.4x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 37,266.1 | 4,036.5 | 2.8x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 33,473.7 | 3,682.2 | 3.1x slower | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,231.8 | 1,254.2 | 10x slower | ✅ | Postgres 1.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 38.7x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,974.0 | 233.5 | 52x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 839.6 | 118.8 | 122.3x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 564.7 | 79.5 | 181.8x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 229.0 | 29.2 | 448.1x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 124.5 | 15.4 | 824.6x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 36.1 | 4.5 | 2839.7x slower | ✅ | Postgres 2.0 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval on the eight busiest ERC-20s is followed by a read of the allowance at that block: 15,703 calls, 200ms each, answered by the benchmark so every tool waits the same. Nothing limits how many a tool may have outstanding, so the rows differ by how many of those waits it takes at once.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 16,048.3 | 1,058.2 | — | ✅ | ClickHouse 2.1 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 13,483.8 | 887.6 | 1.2x slower | ✅ | Postgres 8.5 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 10,776.2 | 705.4 | 1.5x slower | ✅ | Postgres 8.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8,205.7 | 520.4 | 2x slower | ✅ | Postgres 8.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,747.8 | 496.7 | 2.1x slower | ✅ | Postgres 7.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,418.9 | 476.6 | 2.2x slower | ✅ | Postgres 7.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 3,619.8 | 245.6 | 4.4x slower | ✅ | Postgres 8.6 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 850.0 | 45.0 | 18.9x slower | ✅ | Postgres 8.6 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 830.1 | 44.0 | 19.3x slower | ✅ | Postgres 8.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 71.5 | 4.5 | 224.5x slower | ✅ | Postgres 20.2 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 42.4 | 2.9 | 378.6x slower | ❓ (1) | Postgres ~11.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3.8 | 0.3 | 4234.4x slower | ❓ (2) | Postgres ~16.8 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (3) | — |

> **(1)** Ponder — missing 33% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 94% of the data: the verification range was not finished within 300s
> **(3)** Substreams — its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? The indexer watches the Safe proxy factories, and every one of the 82,268 proxies they create becomes another contract it has to follow from that moment on.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 17,591.9 | 6,210.3 | — | ✅ | ClickHouse 3.9 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,075.8 | 4,263.0 | 1.5x slower | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,594.5 | 3,740.1 | 1.7x slower | ✅ | Postgres 14.0 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 9,432.4 | 3,329.8 | 1.9x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 6,442.0 | 2,274.1 | 2.7x slower | ✅ | Postgres 11.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 6,254.4 | 2,207.9 | 2.8x slower | ✅ | Postgres 11.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,206.8 | 1,132.0 | 5.5x slower | ✅ | Postgres 14.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 397.0 | 140.1 | 44.3x slower | ❌ (1) | Postgres 13.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 302.8 | 106.9 | 58.1x slower | ✅ | Postgres 25.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 277.2 | 85.4 | 63.5x slower | ❓ (2) | Postgres ~14.0 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 66x slower | ❓ (3) | Postgres ~14.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 33.3 | 10.8 | 528x slower | ❓ (4) | Postgres ~40.5 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (5) | — |

> **(1)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Squid SDK — missing 1.9% of the data: the verification range was not finished within 300s
> **(3)** Substreams — missing 5.6% of the data: the verification range was not finished within 300s
> **(4)** Subgraph — missing 88% of the data: the verification range was not finished within 300s
> **(5)** SubQuery — indexed nothing in 300s, so there was no data to verify
<!-- BENCHMARK:safe-factory-registrations:END -->

[How this case works, and how to run it →](./cases/safe-factory-registrations/README.md)


### Time-Based Snapshots

Some data is read at a fixed time rather than when something happens. The indexer keeps an hourly price snapshot of the Uniswap V3 USDC/WETH 0.3% pool, including the hours nobody traded, so it has to act on every block, not just the pool's events.

<!-- BENCHMARK:uniswap-hourly-snapshots:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 22,019.7 | 20,637.9 | — | ✅ | ClickHouse 2.6 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 20,944.8 | 19,636.8 | 1.1x slower | ✅ | Postgres 1.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 117.3 | 1,962.4 | 187.6x slower | ✅ | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 68.8 | 1,150.9 | 320x slower | ❓ (1) | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 64.4 | 1,077.5 | 341.8x slower | ❓ (2) | Postgres 1.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 9.0 | 225.5 | 2460x slower | ❓ (3) | Postgres ~1.7 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8.9 | 223.8 | 2478x slower | ❓ (4) | Postgres ~1.7 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3.2 | 103.1 | 6793x slower | ❓ (5) | Postgres ~4.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1.1 | 48.5 | 19949.6x slower | ❓ (6) | Postgres ~90.1 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.2 | 24.0 | 103392.7x slower | ❓ (7) | Postgres ~552 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | — | — | — | — (8) | — |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | — | — | — | — (9) | — |

> **(1)** Envio Subgraph — indexed nothing in 300s, so there was no data to verify
> **(2)** Envio Subgraph — indexed nothing in 300s, so there was no data to verify
> **(3)** Squid SDK — missing 77% of the data: the verification range was not finished within 300s
> **(4)** Squid SDK — missing 78% of the data: the verification range was not finished within 300s
> **(5)** Ponder — missing 92% of the data: the verification range was not finished within 300s
> **(6)** SubQuery — missing 97% of the data: the verification range was not finished within 300s
> **(7)** Subgraph — missing 99% of the data: the verification range was not finished within 300s
> **(8)** Rindexer — it has event handlers only, so it cannot act on a block without an event
> **(9)** Rindexer — it has event handlers only, so it cannot act on a block without an event
<!-- BENCHMARK:uniswap-hourly-snapshots:END -->

[How this case works, and how to run it →](./cases/uniswap-hourly-snapshots/README.md)


### Solana USDC Transfers

Every USDC transfer on Solana, through the chain's busiest program. Solana makes that harder than it sounds: transfers hide inside swaps and routers, and many never say which token they moved. The scenario follows StreamingFast's [SPL token Substreams](https://github.com/streamingfast/substreams-solana-spl-token).

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 20,346.5 | 312.6 | — | ✅ | Postgres 37.8 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 19,182.4 | 294.9 | 1.1x slower | ✅ | ClickHouse 13.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 5.3x slower | ✅ | Postgres 62.7 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 915.5 | 30.7 | 22.2x slower | ✅ | Postgres 37.9 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 36.1x slower | ✅ | Postgres 40.4 MB |
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
