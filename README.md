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
| [Envio Indexer](https://envio.dev) | RPC | 11/11 ✅ (2 restarts) | 7/7 ✅ | 16/16 ✅ | 6/6 ✅ | 4/4 ✅ (7ms, WS) | **44 / 44** |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | RPC | 11/11 ✅ (2 restarts) | 7/7 ✅ | 16/16 ✅ | 6/6 ✅ | 4/4 ✅ (8ms, WS) | **44 / 44** |
| [Ponder](https://ponder.sh) | RPC | 11/11 ✅ (no restarts) | 7/7 ✅ | **14/16** | **5/6** | 4/4 ✅ (13ms, WS) | **41 / 44** |
| [Squid SDK](https://sqd.dev/sdk/) | RPC | 11/11 ✅ (2 restarts) | 7/7 ✅ | **12/16** | 6/6 ✅ | 4/4 ✅ (8ms, WS) | **40 / 44** |
| [Subgraph](https://thegraph.com) | RPC | **7/10** (no restarts) | 7/7 ✅ | **13/14** | 6/6 ✅ | 4/4 ✅ (929ms) | **37 / 41** |
| [SubQuery](https://subquery.network) | RPC | 11/11 ✅ (no restarts) | **0/7** | 14/14 ✅ | 6/6 ✅ | **3/4** (3.8s) | **34 / 42** |
| [Rindexer](https://rindexer.xyz) | RPC | 11/11 ✅ (no restarts) | **1/7** | **9/14** | 4/4 ✅ | 4/4 ✅ (105ms) | **29 / 40** |

<details>
<summary>What failed, and what it means for you - 30 failing checks across 5 tools</summary>

- **Ponder**
  - *rpc faults*
    - **Missing data**: deletes rows when an RPC node briefly reports an older block
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
    - **Stops indexing**: stops picking up new blocks after the database restarts
    - **Slow deploys**: ignores the shutdown signal for over 15 seconds and gets force-killed
    - <i>not tested: recovers by itself when an unresponsive database comes back</i>
  - *rpc faults*
    - **Stops indexing**: does not resume after the RPC node recovers
    - <i>not tested: keeps following the chain when its block subscription goes quiet</i>
    - <i>not tested: fills in the blocks it was never told about</i>
- **SubQuery**
  - *reorgs*
    - **Stale data**: keeps an event after the chain replaced its block
    - **Stale data**: keeps blocks from a fork the chain abandoned for a shorter one
    - **Stale data**: keeps an event the chain removed
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
    - **Wrong data**: carries on after a chain rewrite deeper than it can undo, instead of stopping
    - **Wrong data**: loses track when the chain rewrites several times in a row
    - **Stale data**: misses a chain rewrite in blocks it was still syncing
  - *rpc faults*
    - **Stops indexing**: does not resume after the RPC node recovers
    - **Stops indexing**: cannot cope with a provider's response-size limit
    - **Wrong balances**: counts a transfer twice when the RPC node sends it twice
    - **Missing data**: skips a block the RPC node briefly failed to return
    - **Stops indexing**: crashes when a block it asked for has just been replaced
    - <i>not tested: keeps following the chain when its block subscription goes quiet</i>
    - <i>not tested: fills in the blocks it was never told about</i>
  - *data fidelity*
    - <i>not tested: stores a token with an empty symbol</i>
    - <i>not tested: stores a token name containing a hidden null character</i>

</details>
<!-- RELIABILITY:END -->

Each cell is the checks a tool passed out of the checks it was asked. The number in brackets is a measurement beside the score, not part of it.

[What every check means, and how to run it →](./reliability/README.md)


### State Aggregation

How well does an indexer cope with data it has to read back? Every rETH transfer changes a balance, so for each one the indexer has to find the right row, update it, and save it again. The scenario follows the benchmark on the [Ponder landing page](https://ponder.sh).

<!-- BENCHMARK:erc20-account-balances:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,399.0 | 34,172.9 | — | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,166.7 | 33,397.1 | 1.1x slower | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,467.1 | 19,815.2 | 1.8x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 840.5 | 5,962.5 | 5.2x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 649.6 | 4,893.8 | 6.8x slower | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 240.9 | 2,261.8 | 18.3x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 182.4 | 1,758.9 | 24.1x slower | ✅ | Postgres 5.3 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 57.7 | 759.2 | 76.3x slower | ✅ | Postgres 3.3 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 153.3x slower | ✅ | Postgres 2.2 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.8 | 339.1 | 170.8x slower | ✅ | Postgres 6.9 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.3 | 332.7 | 174x slower | ❓ (1) | Postgres ~4.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 9.9 | 113.3 | 444.4x slower | ❓ (2) | Postgres ~2.7 MB |

> **(1)** SubQuery — missing 0.12% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK — missing 61% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

How fast can an indexer write? Every USDC transfer is stored once, with nothing to aggregate and nothing to look up first. This is the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 98,370.4 | 10,186.5 | — | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 60,843.4 | 6,632.5 | 1.6x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 37,131.7 | 4,007.3 | 2.6x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 15,784.7 | 1,843.2 | 6.2x slower | ✅ | Postgres 1.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,238.9 | 912.1 | 13.6x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4,425.4 | 562.8 | 22.2x slower | ✅ | Postgres 3.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 37.1x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 979.8 | 134.7 | 100.4x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 837.6 | 118.5 | 117.4x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 228.8 | 29.1 | 430x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 153.4 | 19.2 | 641.3x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 31.7 | 3.9 | 3105.7x slower | ✅ | Postgres 1.9 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval on the eight busiest ERC-20s is followed by a read of the allowance at that block: 15,703 calls, 200ms each, answered by the benchmark so every tool waits the same. Nothing limits how many a tool may have outstanding, so the rows differ by how many of those waits it takes at once.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 15,305.4 | 1,014.7 | — | ✅ | Postgres 8.3 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,610.0 | 830.7 | 1.2x slower | ✅ | Postgres 8.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 9,634.9 | 617.8 | 1.6x slower | ✅ | Postgres 8.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,770.5 | 498.2 | 2x slower | ✅ | Postgres 7.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,038.4 | 454.6 | 2.2x slower | ✅ | Postgres 7.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,389.5 | 173.4 | 6.4x slower | ✅ | Postgres 8.6 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,286.9 | 79.7 | 11.9x slower | ✅ | Postgres 8.6 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 841.4 | 44.5 | 18.2x slower | ✅ | Postgres 8.4 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 65.7 | 4.1 | 232.9x slower | ✅ | Postgres 20.0 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 31.9 | 2.3 | 479.5x slower | ❓ (1) | Postgres ~11.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.1 | 0.3 | 3762.1x slower | ❓ (2) | Postgres ~16.9 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (3) | — |

> **(1)** Ponder — missing 50% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 94% of the data: the verification range was not finished within 300s
> **(3)** Substreams — its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? The indexer watches the Safe proxy factories, and every one of the 82,268 proxies they create becomes another contract it has to follow from that moment on.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,503.8 | 2,649.0 | — | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 5,914.9 | 2,088.1 | 1.3x slower | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 5,858.6 | 2,068.2 | 1.3x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,534.4 | 1,600.7 | 1.7x slower | ✅ | Postgres 11.5 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4,068.9 | 1,436.4 | 1.8x slower | ✅ | Postgres 14.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 3,141.0 | 1,123.7 | 2.4x slower | ❌ (1) | Postgres 13.8 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,643.1 | 933.1 | 2.8x slower | ✅ | Postgres 11.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 289.8 | 102.3 | 25.9x slower | ❌ (2) | Postgres 13.8 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 28.1x slower | ❓ (3) | Postgres ~14.5 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 200.6 | 39.1 | 37.4x slower | ❓ (4) | Postgres ~25.8 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 22.0 | 10.2 | 340.9x slower | ❓ (5) | Postgres ~48.0 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (6) | — |

> **(1)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(3)** Substreams — missing 5.6% of the data: the verification range was not finished within 300s
> **(4)** Ponder — missing 29% of the data: the verification range was not finished within 300s
> **(5)** Subgraph — missing 92% of the data: the verification range was not finished within 300s
> **(6)** SubQuery — indexed nothing in 300s, so there was no data to verify
<!-- BENCHMARK:safe-factory-registrations:END -->

[How this case works, and how to run it →](./cases/safe-factory-registrations/README.md)


### Solana USDC Transfers

Every USDC transfer on Solana, through the chain's busiest program. Solana makes that harder than it sounds: transfers hide inside swaps and routers, and many never say which token they moved. The scenario follows StreamingFast's [SPL token Substreams](https://github.com/streamingfast/substreams-solana-spl-token).

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 24,396.7 | 381.4 | — | ✅ | Postgres 37.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 9,998.3 | 317.9 | 2.4x slower | ✅ | Postgres 37.7 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 6.3x slower | ✅ | Postgres 62.7 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 43.3x slower | ✅ | Postgres 40.4 MB |
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
