# Open Indexer Benchmark

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

How fast is a blockchain indexer, and what does it do when something goes
wrong? This repository measures both, for the tools people actually build on.

Every number comes from code in this repository, so you can run it yourself and
check, and CI refreshes the tables.

- [**Reliability**](#reliability) - what a tool does when its database restarts
  under it, the chain reorgs, or the node it reads from starts failing.
- [**Speed**](#speed) - how fast each tool gets through five scenarios, from a
  plain event stream to Solana.


## Reliability

An indexer that is fast and wrong is not fast. These scenarios take the
database away mid-write, rewrite the chain underneath the tool, make the node
answer 429 to everything, and hand it values that are legal but awkward - then
check what ended up in the database.

<!-- RELIABILITY:START -->
| tool | source | crash recovery | reorgs | rpc faults | data fidelity | head latency | overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (1) |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (2) |
| [Ponder](https://ponder.sh) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (3) |
| [Rindexer](https://rindexer.xyz) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (4) |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (5) |
| [Subgraph](https://thegraph.com) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (6) |
| [SubQuery](https://subquery.network) | [RPC](./reliability/README.md#why-a-generated-chain-and-not-a-real-node) | — | — | — | — | — | — (7) |

> **(1)** Envio Indexer - not measured yet: no run has published a result
> **(2)** Envio Subgraph - not measured yet: no run has published a result
> **(3)** Ponder - not measured yet: no run has published a result
> **(4)** Rindexer - not measured yet: no run has published a result
> **(5)** Squid SDK - not measured yet: no run has published a result
> **(6)** Subgraph - not measured yet: no run has published a result
> **(7)** SubQuery - not measured yet: no run has published a result
<!-- RELIABILITY:END -->

Each cell is the checks a tool passed out of the checks it was asked. Follow
one for the list behind it, and for what is deliberately not asked yet.

[What every check means →](./reliability/README.md)


## Speed

Five scenarios, each run over a fixed block range to check the data and over a
timed window to measure the rate.

### State Aggregation

Every rETH transfer changes a balance, so the indexer has to find the right row, update it and save it again. Reading your own writes is the slow part.

<!-- BENCHMARK:erc20-account-balances:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,043.2 | 16,283.3 | — | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 1,313.8 | 11,271.5 | 1.6x slower | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,032.3 | 8,547.0 | 2x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 602.7 | 4,484.4 | 3.4x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 538.7 | 3,754.7 | 3.8x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 64.4 | 847.8 | 31.7x slower | ✅ | Postgres 4.6 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 36.5 | 480.4 | 56x slower | ✅ | Postgres 3.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 29.8 | 346.4 | 68.6x slower | ✅ | Postgres 2.2 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 71.2x slower | ✅ | Postgres 2.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 24.8 | 327.4 | 82.4x slower | ❓ (1) | Postgres ~4.4 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 14.9 | 165.0 | 137.3x slower | ❓ (2) | Postgres ~7.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 8.2 | 92.6 | 249.8x slower | ❓ (3) | Postgres ~2.8 MB |

> **(1)** SubQuery — missing 1.9% of the data: the verification range was not finished within 300s
> **(2)** Subgraph — missing 41% of the data: the verification range was not finished within 300s
> **(3)** Squid SDK — missing 68% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

Every USDC transfer, stored once, with nothing to aggregate and nothing to look up first. The ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 86,862.1 | 9,153.9 | — | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 83,028.0 | 8,784.9 | — | ✅ | Postgres 3.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 37,471.6 | 4,062.7 | 2.3x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 12,341.5 | 1,467.7 | 7x slower | ✅ | Postgres 1.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 5,191.2 | 660.9 | 16.7x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,888.0 | 477.4 | 22.3x slower | ✅ | Postgres 3.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 32.7x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 867.0 | 122.4 | 100.2x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 441.2 | 63.4 | 196.9x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 230.1 | 29.3 | 377.6x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 63.6 | 7.9 | 1366.3x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 31.8 | 3.9 | 2731.5x slower | ✅ | Postgres 1.9 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval is followed by a read of the allowance at that block - 15,703 calls, answered at a fixed latency so every tool waits the same.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,563.5 | 827.6 | — | ✅ | Postgres 8.5 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 12,379.2 | 816.1 | — | ✅ | Postgres 8.3 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,749.0 | 496.8 | 1.6x slower | ✅ | Postgres 7.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 6,711.5 | 437.8 | 1.9x slower | ✅ | Postgres 8.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 6,452.1 | 418.4 | 1.9x slower | ✅ | Postgres 7.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 3,593.2 | 245.0 | 3.5x slower | ✅ | Postgres 8.6 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 784.2 | 41.6 | 16x slower | ✅ | Postgres 8.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 601.0 | 32.8 | 20.9x slower | ✅ | Postgres 8.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 57.9 | 3.6 | 217x slower | ❓ (1) | Postgres ~20.6 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 32.6 | 2.3 | 385.8x slower | ❓ (2) | Postgres ~11.7 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.1 | 0.3 | 3092.1x slower | ❓ (3) | Postgres ~16.6 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (4) | — |

> **(1)** Subgraph — missing 9.2% of the data: the verification range was not finished within 300s
> **(2)** Ponder — missing 49% of the data: the verification range was not finished within 300s
> **(3)** SubQuery — missing 94% of the data: the verification range was not finished within 300s
> **(4)** Substreams — its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? Each of the 82,268 proxies the Safe factories create becomes another contract to follow.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 5,909.8 | 2,086.3 | — | ✅ | Postgres 14.0 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,567.6 | 1,612.4 | 1.3x slower | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,900.5 | 1,377.0 | 1.5x slower | ✅ | Postgres 14.0 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,623.7 | 1,279.2 | 1.6x slower | ✅ | Postgres 14.0 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 3,384.2 | 1,210.8 | 1.7x slower | ❌ (1) | Postgres 13.8 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 3,044.9 | 1,074.9 | 1.9x slower | ✅ | Postgres 11.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,485.3 | 524.3 | 4x slower | ✅ | Postgres 11.2 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 277.2 | 82.8 | 21.3x slower | ❓ (2) | Postgres ~25.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 22.2x slower | ❓ (3) | Postgres ~14.5 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 265.0 | 68.9 | 22.3x slower | ❓ (4) | Postgres ~14.0 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 20.0 | 10.1 | 295.1x slower | ❓ (5) | Postgres ~50.6 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (6) | — |

> **(1)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Ponder — missing 1.8% of the data: the verification range was not finished within 300s
> **(3)** Substreams — missing 5.6% of the data: the verification range was not finished within 300s
> **(4)** Squid SDK — missing 6.3% of the data: the verification range was not finished within 300s
> **(5)** Subgraph — missing 93% of the data: the verification range was not finished within 300s
> **(6)** SubQuery — indexed nothing in 300s, so there was no data to verify
<!-- BENCHMARK:safe-factory-registrations:END -->

[How this case works, and how to run it →](./cases/safe-factory-registrations/README.md)


### Solana USDC Transfers

The same question on a chain with no logs to subscribe to, where a transfer is an instruction inside a transaction.

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 23,352.4 | 363.6 | — | ✅ | Postgres 37.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 7,376.9 | 235.5 | 3.2x slower | ✅ | Postgres 37.7 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 6.1x slower | ✅ | Postgres 62.7 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 41.5x slower | ✅ | Postgres 40.4 MB |
<!-- BENCHMARK:solana-spl-transfers:END -->

[How this case works, and how to run it →](./cases/solana-spl-transfers/README.md)


## Run it yourself

```bash
# Reliability: no credentials needed, the chain is generated
node reliability/run.ts ponder --scenarios=reorg-cases

# Speed: needs an Envio API token for the RPC endpoint and the ground truth
ENVIO_API_TOKEN=your-token node scripts/run-benchmarks.ts ponder --cases=erc20-transfer-events
```

Each scenario page linked above has its own setup notes, and
[METHODOLOGY.md](./METHODOLOGY.md) explains how the numbers are produced and
what every column means.


## Contributing

Contributions are welcome - we already have some from the [SQD](https://sqd.dev)
team. Open an issue or a pull request to add an indexer, add a scenario, report
a result that looks wrong, or improve the methodology. Indexer teams especially:
nobody knows your tool better than you do. Or come and ask on
[Discord](https://discord.com/invite/envio) or
[Telegram](https://t.me/+kAIGElzPjApiMjI0).


## History

The benchmark started in May 2025 as a fork of [Sentio](https://sentio.xyz)'s
research. That repository was later closed, so [Envio](https://envio.dev) picked
it up and has kept it current since. We are not affiliated with Sentio, and
although the project now lives under the Envio organisation - its data is what
the [Envio landing page](https://envio.dev) and the
[Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026)
article cite - the point of it is a fair comparison.

Six scenarios from that original research are kept for reference. They are total
sync times rather than throughput rates and predate the current methodology, so
do not compare them with the tables above.

| Case                   | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio_Subgraph | Goldsky_Subgraph |
| ---------------------- | ------ | --------------- | ---------------- | ------ | -------- | -------- | --------------- | ---------------- |
| case_1_lbtc_event_only | 8m     |                 | 3m               | 1h40m  | 10m      | 3h9m     | 2h36m           |                  |
| case_2_lbtc_full       | 6m     |                 | 1m               | 45m    | 34m      | 1h3m     | 56m             |                  |
| case_3_ethereum_block  | 18m    | 7.9s            |                  | 33m    | 1m‡      | 10m      | 15m             |                  |
| case_4_on_transaction  | 17m    | 1m26s           |                  | 33m    | 7m       | N/A      |                 |                  |
| case_5_on_trace        | 16m    | 41s             |                  | N/A§   | 2m       | 8m       | 1h21m           |                  |
| case_6_template        | 19m    |                 | 8s               | 21m    | 2m       | 19m      | 10m             | 20h24m           |

[More about these cases →](./sentio-benchmarks-may-2025/README.md)
