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
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,568.1 | 92,220.4 | — | ✅ | Postgres 2.2 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,562.4 | 92,178.2 | — | ✅ | ClickHouse 748 KB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 11,199.3 | 82,176.8 | 1.1x slower | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,293.9 | 26,495.3 | 3.8x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 1,916.6 | 15,403.5 | 6.6x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 602.6 | 4,482.8 | 20.9x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 404.8 | 2,381.7 | 31.1x slower | ✅ | Postgres 5.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 241.1 | 2,264.0 | 52.1x slower | ✅ | Postgres 2.2 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 65.3 | 860.4 | 192.3x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 42.5 | 559.9 | 295.6x slower | ✅ | Postgres 6.9 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 37.5 | 494.0 | 335x slower | ❓ (1) | Postgres 4.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 437.9x slower | ✅ | Postgres 2.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 20.8 | 264.2 | 603.5x slower | ❓ (2) | Postgres ~2.3 MB |

> **(1)** SubQuery — missing 0.38% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK — missing 18% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

How fast can an indexer write? Every USDC transfer is stored once, with nothing to aggregate and nothing to look up first. This is the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 97,924.0 | 10,189.5 | — | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 86,600.8 | 9,114.4 | 1.1x slower | ✅ | Postgres 3.4 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 80,269.9 | 8,566.8 | 1.2x slower | ✅ | ClickHouse 489 KB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 49,373.4 | 5,301.9 | 2x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 38,017.6 | 4,165.8 | 2.6x slower | ✅ | Postgres 3.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 16,923.6 | 1,974.3 | 5.8x slower | ✅ | Postgres 1.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,666.9 | 1,300.6 | 9.2x slower | ✅ | Postgres 1.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 36.9x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,328.1 | 274.3 | 42.1x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,304.1 | 165.9 | 75.1x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 230.2 | 29.3 | 425.3x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 136.6 | 16.8 | 716.9x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 26.8 | 3.3 | 3653.2x slower | ❓ (1) | Postgres ~1.9 MB |

> **(1)** SubQuery — missing 0.15% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval on the eight busiest ERC-20s is followed by a read of the allowance at that block: 15,703 calls, 200ms each, answered by the benchmark so every tool waits the same. Nothing limits how many a tool may have outstanding, so the rows differ by how many of those waits it takes at once.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 17,083.1 | 1,149.7 | — | ✅ | Postgres 8.5 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 15,924.8 | 1,050.1 | 1.1x slower | ✅ | ClickHouse 2.1 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 13,923.4 | 917.3 | 1.2x slower | ✅ | Postgres 8.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 11,792.7 | 774.1 | 1.4x slower | ✅ | Postgres 8.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,707.2 | 494.1 | 2.2x slower | ✅ | Postgres 7.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,429.2 | 457.4 | 2.3x slower | ✅ | Postgres 7.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,950.7 | 204.7 | 5.8x slower | ✅ | Postgres 8.6 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 796.9 | 42.2 | 21.4x slower | ✅ | Postgres 8.6 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 786.0 | 41.7 | 21.7x slower | ✅ | Postgres 8.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 73.9 | 4.6 | 231.1x slower | ✅ | Postgres 20.3 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 40.2 | 2.8 | 425.1x slower | ❓ (1) | Postgres ~11.6 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.4 | 0.3 | 3904.7x slower | ❓ (2) | Postgres ~16.9 MB |

> **(1)** Ponder — missing 37% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 93% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? The indexer watches the Safe proxy factories, and every one of the 82,268 proxies they create becomes another contract it has to follow from that moment on.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 14,598.9 | 5,153.7 | — | ✅ | Postgres 14.0 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 14,423.7 | 5,091.9 | — | ✅ | ClickHouse 3.9 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 10,740.9 | 3,791.8 | 1.4x slower | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,334.9 | 3,648.4 | 1.4x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,926.2 | 2,798.1 | 1.8x slower | ✅ | Postgres 11.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,128.9 | 2,516.7 | 2x slower | ✅ | Postgres 11.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 5,536.4 | 1,954.5 | 2.6x slower | ✅ | Postgres 14.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 3,917.8 | 1,401.7 | 3.7x slower | ❌ (1) | Postgres 13.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 458.7 | 161.9 | 31.8x slower | ❌ (2) | Postgres 13.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 290.0 | 102.4 | 50.3x slower | ✅ | Postgres 25.3 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 54.7x slower | ❓ (3) | Postgres ~14.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 34.6 | 10.9 | 421.9x slower | ❓ (4) | Postgres ~43.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (5) | — |

> **(1)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
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
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 30,704.2 | 28,556.3 | — | ✅ | Postgres 1.3 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 27,397.9 | 25,631.3 | 1.1x slower | ✅ | ClickHouse 2.6 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 183.9 | 2,921.6 | 166.9x slower | ✅ | Postgres 1.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 104.3 | 1,744.0 | 294.4x slower | ✅ | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 69.7 | 1,166.2 | 440.3x slower | ❓ (1) | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 50.1 | 837.1 | 613.4x slower | ❓ (2) | Postgres 1.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 11.5 | 283.7 | 2663.1x slower | ❓ (3) | Postgres ~1.6 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3.5 | 107.5 | 8853.8x slower | ❓ (4) | Postgres ~4.1 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1.0 | 45.0 | 31942.2x slower | ❓ (5) | Postgres ~96.0 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.5 | 27.9 | 65479.8x slower | ❓ (6) | Postgres ~298 MB |

> **(1)** Envio Subgraph — missing 60% of the data: the verification range was not finished within 300s
> **(2)** Envio Subgraph — missing 97% of the data: the verification range was not finished within 300s
> **(3)** Squid SDK — missing 71% of the data: the verification range was not finished within 300s
> **(4)** Ponder — missing 91% of the data: the verification range was not finished within 300s
> **(5)** SubQuery — missing 98% of the data: the verification range was not finished within 300s
> **(6)** Subgraph — missing 99% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:uniswap-hourly-snapshots:END -->

[How this case works, and how to run it →](./cases/uniswap-hourly-snapshots/README.md)


### Solana USDC Transfers

Every USDC transfer on Solana, through the chain's busiest program. Solana makes that harder than it sounds: transfers hide inside swaps and routers, and many never say which token they moved. The scenario follows StreamingFast's [SPL token Substreams](https://github.com/streamingfast/substreams-solana-spl-token).

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 31,799.8 | 499.8 | — | ✅ | ClickHouse 13.4 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 25,746.3 | 405.7 | 1.2x slower | ✅ | Postgres 37.8 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 8.2x slower | ✅ | Postgres 62.7 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 2,076.1 | 66.5 | 15.3x slower | ✅ | Postgres 37.9 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 56.5x slower | ✅ | Postgres 40.4 MB |
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
