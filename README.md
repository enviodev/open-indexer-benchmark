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
| [Envio Indexer](https://envio.dev) | RPC | 11/11 ✅ (no restarts) | 8/8 ✅ | 19/19 ✅ | 6/6 ✅ | 6/6 ✅ (p50 231ms, p99 261ms, WS) | **50 / 50** |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | RPC | 11/11 ✅ (no restarts) | 8/8 ✅ | 19/19 ✅ | 6/6 ✅ | 6/6 ✅ (p50 232ms, p99 262ms, WS) | **50 / 50** |
| [Ponder](https://ponder.sh) | RPC | 11/11 ✅ (no restarts) | 8/8 ✅ | **18/19** 🔴 | **5/6** 🔴 | 6/6 ✅ (p50 250ms, p99 303ms, WS) | **48 / 50** |
| [Squid SDK](https://sqd.dev/sdk/) | RPC | 11/11 ✅ (2 restarts) | 8/8 ✅ | **15/19** 🔴 | 6/6 ✅ | 6/6 ✅ (p50 570ms, p99 813ms, WS) | **46 / 50** |
| [Subgraph](https://thegraph.com) | RPC | **9/11** 🔴 (no restarts) | 8/8 ✅ | **16/17** 🔴 | 6/6 ✅ | **5/6** 🔴 (p50 8.3s, p99 10.8s) | **44 / 48** |
| [SubQuery](https://subquery.network) | RPC | 11/11 ✅ (no restarts) | **0/8** 🔴 | 17/17 ✅ | 6/6 ✅ | **5/6** 🔴 (p50 4.4s, p99 7.0s) | **39 / 48** |
| [Rindexer](https://rindexer.xyz) | RPC | 11/11 ✅ (no restarts) | **1/8** 🔴 | **12/17** 🔴 | 6/6 ✅ | **4/6** 🔴 (p50 34.0s, p99 36.2s) | **34 / 48** |

<details>
<summary>What failed, and what it means for you - 33 failing checks across 5 tools</summary>

- **Ponder**
  - *rpc faults*
    - **Stops indexing silently**: stops following the chain when its block subscription goes quiet
  - *data fidelity*
    - **Missing data**: drops events with very large log indexes, which some providers emit
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
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,997.7 | 95,242.5 | — | ✅ | ClickHouse 753 KB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 11,632.9 | 85,241.0 | 1.1x slower | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 10,821.4 | 79,294.6 | 1.2x slower | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4,708.9 | 36,291.7 | 2.8x slower | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,850.5 | 21,819.2 | 4.6x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 1,622.6 | 14,351.5 | 8x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 591.6 | 4,340.1 | 22x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 297.7 | 2,124.7 | 43.7x slower | ✅ | Postgres 5.3 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 65.7 | 865.1 | 197.9x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 40.3 | 531.1 | 322.3x slower | ✅ | Postgres 6.9 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 452.9x slower | ✅ | Postgres 2.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.2 | 331.5 | 515.1x slower | ❓ (1) | Postgres ~4.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 18.8 | 232.2 | 690.6x slower | ❓ (2) | Postgres ~2.3 MB |

> **(1)** SubQuery — missing 0.22% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK — missing 25% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

How fast can an indexer write? Every USDC transfer is stored once, with nothing to aggregate and nothing to look up first. This is the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 126,125.3 | 12,676.8 | — | ✅ | ClickHouse 488 KB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 86,997.0 | 9,156.1 | 1.4x slower | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 76,514.9 | 8,229.9 | 1.6x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 39,118.7 | 4,254.8 | 3.2x slower | ✅ | Postgres 1.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 21,447.4 | 2,448.5 | 5.9x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 16,369.0 | 1,908.8 | 7.7x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 12,575.9 | 1,513.1 | 10x slower | ✅ | Postgres 3.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8,041.2 | 1,012.2 | 15.7x slower | ✅ | Postgres 1.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 47.5x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 786.0 | 107.4 | 160.5x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 231.6 | 29.5 | 544.7x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 171.9 | 21.7 | 733.8x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 26.5 | 3.3 | 4766.1x slower | ❓ (1) | Postgres ~1.9 MB |

> **(1)** SubQuery — missing 1.4% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval on the eight busiest ERC-20s is followed by a read of the allowance at that block: 15,703 calls, 200ms each, answered by the benchmark so every tool waits the same. Nothing limits how many a tool may have outstanding, so the rows differ by how many of those waits it takes at once.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 13,655.9 | 898.6 | — | ✅ | ClickHouse 2.1 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 13,491.2 | 889.2 | — | ✅ | Postgres 8.3 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 13,379.1 | 884.2 | — | ✅ | Postgres 8.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,934.3 | 717.2 | 1.2x slower | ✅ | Postgres 8.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,693.2 | 493.2 | 1.8x slower | ✅ | Postgres 7.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,414.6 | 476.3 | 1.8x slower | ✅ | Postgres 7.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,757.8 | 115.6 | 7.8x slower | ✅ | Postgres 8.5 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 1,689.4 | 110.9 | 8.1x slower | ✅ | Postgres 8.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 831.2 | 44.0 | 16.4x slower | ✅ | Postgres 8.4 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 71.5 | 4.5 | 191.1x slower | ✅ | Postgres 20.2 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 39.0 | 2.7 | 350x slower | ❓ (1) | Postgres ~11.9 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.2 | 0.3 | 3276.6x slower | ❓ (2) | Postgres ~16.8 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (3) | — |

> **(1)** Ponder — missing 39% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 93% of the data: the verification range was not finished within 300s
> **(3)** Substreams — its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? The indexer watches the Safe proxy factories, and every one of the 82,268 proxies they create becomes another contract it has to follow from that moment on.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 17,341.7 | 6,122.0 | — | ✅ | ClickHouse 3.9 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 17,175.6 | 6,063.3 | — | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 9,200.4 | 3,247.9 | 1.9x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8,857.0 | 3,126.7 | 2x slower | ✅ | Postgres 11.4 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,334.5 | 2,589.2 | 2.4x slower | ✅ | Postgres 11.5 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,843.5 | 1,411.9 | 3.6x slower | ✅ | Postgres 14.0 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4,069.0 | 1,728.7 | 4.3x slower | ✅ | Postgres 14.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 3,343.8 | 1,196.3 | 5.2x slower | ❌ (1) | Postgres 13.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 415.1 | 146.5 | 41.8x slower | ❌ (2) | Postgres 13.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 342.4 | 120.9 | 50.6x slower | ✅ | Postgres 25.3 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 65x slower | ❓ (3) | Postgres ~14.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 54.3 | 23.9 | 319.4x slower | ❓ (4) | Postgres ~35.4 MB |
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
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 55,717.0 | 51,619.3 | — | ✅ | Postgres 1.3 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 53,722.9 | 49,841.5 | — | ✅ | ClickHouse 2.6 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 32,316.3 | 30,013.6 | 1.7x slower | ✅ | Postgres 1.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,909.4 | 2,737.3 | 19.2x slower | ✅ | Postgres 1.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.17.1-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,729.0 | 2,571.8 | 20.4x slower | ✅ | Postgres 1.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 214.3 | 3,415.4 | 259.9x slower | ✅ | Postgres 1.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8.6 | 220.6 | 6486.5x slower | ❓ (1) | Postgres ~1.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3.5 | 108.1 | 16021.7x slower | ❓ (2) | Postgres ~4.1 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.9 | 39.9 | 65152.5x slower | ❓ (3) | Postgres ~99.2 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.4 | 26.2 | 124946.9x slower | ❓ (4) | Postgres ~296 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | — | — | — | — (5) | — |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | — | — | — | — (6) | — |

> **(1)** Squid SDK — missing 78% of the data: the verification range was not finished within 300s
> **(2)** Ponder — missing 91% of the data: the verification range was not finished within 300s
> **(3)** SubQuery — missing 98% of the data: the verification range was not finished within 300s
> **(4)** Subgraph — missing 99% of the data: the verification range was not finished within 300s
> **(5)** Rindexer — it has event handlers only, so it cannot act on a block without an event
> **(6)** Rindexer — it has event handlers only, so it cannot act on a block without an event
<!-- BENCHMARK:uniswap-hourly-snapshots:END -->

[How this case works, and how to run it →](./cases/uniswap-hourly-snapshots/README.md)


### Solana USDC Transfers

Every USDC transfer on Solana, through the chain's busiest program. Solana makes that harder than it sounds: transfers hide inside swaps and routers, and many never say which token they moved. The scenario follows StreamingFast's [SPL token Substreams](https://github.com/streamingfast/substreams-solana-spl-token).

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 39,057.9 | 583.8 | — | ✅ | Postgres 37.8 MB |
| [Envio Indexer (ClickHouse)](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 34,669.8 | 537.5 | 1.1x slower | ✅ | ClickHouse 13.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 10.1x slower | ✅ | Postgres 62.7 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 718.6 | 24.1 | 54.4x slower | ✅ | Postgres 37.9 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 69.3x slower | ✅ | Postgres 40.4 MB |
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
