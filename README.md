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
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 8,182.4 | 57,701.3 | — | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,649.6 | 53,720.8 | 1.1x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 947.2 | 6,894.0 | 8.6x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 556.1 | 3,891.4 | 14.7x slower | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 341.9 | 2,555.6 | 23.9x slower | ✅ | Postgres 2.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 322.8 | 2,413.8 | 25.3x slower | ✅ | Postgres 4.9 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 241.1 | 2,263.7 | 33.9x slower | ✅ | Postgres 2.2 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 62.0 | 816.1 | 132x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 31.4 | 412.8 | 261x slower | ✅ | Postgres 7.0 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 285.1x slower | ✅ | Postgres 2.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.3 | 332.5 | 323.9x slower | ❓ (1) | Postgres ~4.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 17.3 | 199.7 | 474.1x slower | ❓ (2) | Postgres ~2.4 MB |

> **(1)** SubQuery - missing 0.12% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK - missing 32% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

Every USDC transfer, stored once, with nothing to aggregate and nothing to look up first. The ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 78,416.1 | 8,379.5 | — | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 62,889.7 | 6,872.5 | 1.2x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 35,038.6 | 3,803.2 | 2.2x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 11,641.2 | 1,399.2 | 6.7x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 10,949.5 | 1,342.3 | 7.2x slower | ✅ | Postgres 3.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 29.6x slower | ✅ | Postgres 1.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,311.9 | 166.9 | 59.8x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,042.0 | 140.1 | 75.3x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 834.5 | 118.1 | 94x slower | ✅ | Postgres 1.4 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 108.2 | 13.3 | 724.6x slower | ✅ | Postgres 2.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 37.4 | 4.6 | 2095.7x slower | ✅ | Postgres 2.5 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 31.8 | 3.9 | 2468.5x slower | ✅ | Postgres 1.9 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval is followed by a read of the allowance at that block - 15,703 calls, answered at a fixed latency so every tool waits the same.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 13,164.4 | 869.9 | — | ✅ | Postgres 8.3 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,541.7 | 826.6 | — | ✅ | Postgres 8.4 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,704.4 | 494.0 | 1.7x slower | ✅ | Postgres 7.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,404.2 | 475.7 | 1.8x slower | ✅ | Postgres 7.3 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,685.3 | 191.6 | 4.9x slower | ✅ | Postgres 8.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,050.8 | 144.0 | 6.4x slower | ✅ | Postgres 8.6 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 824.8 | 43.7 | 16x slower | ✅ | Postgres 8.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 398.1 | 23.2 | 33.1x slower | ✅ | Postgres 8.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 59.8 | 3.8 | 220.1x slower | ❓ (1) | Postgres ~20.5 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 36.0 | 2.5 | 365.9x slower | ❓ (2) | Postgres ~11.7 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.6 | 0.3 | 2849.4x slower | ❓ (3) | Postgres ~16.2 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (4) | — |

> **(1)** Subgraph - missing 6.0% of the data: the verification range was not finished within 300s
> **(2)** Ponder - missing 43% of the data: the verification range was not finished within 300s
> **(3)** SubQuery - missing 93% of the data: the verification range was not finished within 300s
> **(4)** Substreams - its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? Each of the 82,268 proxies the Safe factories create becomes another contract to follow.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 10,781.9 | 3,806.2 | — | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 9,267.1 | 3,271.5 | 1.2x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,148.9 | 2,523.7 | 1.5x slower | ✅ | Postgres 11.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.10.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,834.1 | 1,353.5 | 2.8x slower | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,622.6 | 1,278.8 | 3x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,605.1 | 1,272.7 | 3x slower | ✅ | Postgres 11.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 2,531.6 | 905.7 | 4.3x slower | ❌ (1) | Postgres 13.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 333.7 | 117.8 | 32.3x slower | ❌ (2) | Postgres 13.8 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 282.7 | 96.5 | 38.1x slower | ❓ (3) | Postgres ~25.3 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 40.4x slower | ❓ (4) | Postgres ~14.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 28.7 | 10.6 | 375.7x slower | ❓ (5) | Postgres ~42.3 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (6) | — |

> **(1)** Squid SDK - 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Squid SDK - 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(3)** Ponder - missing 0.18% of the data: the verification range was not finished within 300s
> **(4)** Substreams - missing 5.6% of the data: the verification range was not finished within 300s
> **(5)** Subgraph - missing 90% of the data: the verification range was not finished within 300s
> **(6)** SubQuery - indexed nothing in 300s, so there was no data to verify
<!-- BENCHMARK:safe-factory-registrations:END -->

[How this case works, and how to run it →](./cases/safe-factory-registrations/README.md)


### Solana USDC Transfers

The same question on a chain with no logs to subscribe to, where a transfer is an instruction inside a transaction.

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 16,204.7 | 246.4 | — | ✅ | Postgres 37.8 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 4.2x slower | ✅ | Postgres 62.7 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 996.8 | 33.5 | 16.3x slower | ✅ | Postgres 37.7 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 28.8x slower | ✅ | Postgres 40.4 MB |
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
