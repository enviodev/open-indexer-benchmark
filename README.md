# Open Indexer Benchmark

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

An open and honest benchmark for blockchain indexers. Every number below comes from code in this repository, so you can run it yourself and check, and the tables are refreshed automatically by scheduled CI runs.

If you want to know how the numbers are produced, or what a column means, that is all in [METHODOLOGY.md](./METHODOLOGY.md).


## History

The benchmark started in May 2025 as a fork of [Sentio](https://sentio.xyz)'s research. That repository was later closed, so [Envio](https://envio.dev) picked it up and has kept it current since. We are not affiliated with Sentio, and although the project now lives under the Envio organisation — its data is what the [Envio landing page](https://envio.dev) and the [Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026) article cite — the point of it is a fair comparison.


## Contributing

Contributions are welcome — we already have some from the [SQD](https://sqd.dev) team. Open an issue or a pull request to add an indexer, add a scenario, report a result that looks wrong, or improve the methodology. Indexer teams especially: nobody knows your tool better than you do. Or just come and ask on [Discord](https://discord.com/invite/envio) or [Telegram](https://t.me/+kAIGElzPjApiMjI0).


## Scenarios

### State Aggregation

How well does an indexer cope with data it has to read back? Every rETH transfer changes a balance, so for each one the indexer has to find the right row, update it, and save it again. The scenario follows the benchmark on the [Ponder landing page](https://ponder.sh).

<!-- BENCHMARK:erc20-account-balances:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 5,460.4 | 43,895.8 | — | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,998.4 | 38,423.5 | 1.1x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 890.7 | 6,430.2 | 6.1x slower | ✅ | Postgres 5.2 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 590.3 | 4,350.5 | 9.2x slower | ✅ | Postgres 2.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 269.0 | 2,361.5 | 20.3x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 182.0 | 2,096.0 | 30x slower | ✅ | Postgres 5.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 66.2 | 833.2 | 82.5x slower | ✅ | Postgres 2.3 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 49.7 | 654.9 | 109.8x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 33.4 | 439.7 | 163.5x slower | ✅ | Postgres 7.0 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 28.7 | 377.8 | 190.3x slower | ✅ | Postgres 2.2 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.1 | 330.2 | 217.4x slower | ❓ (1) | Postgres ~4.3 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 9.0 | 102.3 | 604x slower | ❓ (2) | Postgres ~2.8 MB |

> **(1)** SubQuery — missing 0.67% of the data: the verification range was not finished within 300s
> **(2)** Squid SDK — missing 64% of the data: the verification range was not finished within 300s
<!-- BENCHMARK:erc20-account-balances:END -->

[How this case works, and how to run it →](./cases/erc20-account-balances/README.md)


### Decoded Event Stream

How fast can an indexer write? Every USDC transfer is stored once, with nothing to aggregate and nothing to look up first. This is the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 88,480.2 | 9,312.2 | — | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 65,342.7 | 7,146.8 | 1.4x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 37,745.7 | 4,090.9 | 2.3x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 13,037.4 | 1,552.3 | 6.8x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,838.2 | 468.2 | 23.1x slower | ✅ | Postgres 3.4 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 2,653.1 | 310.7 | 33.3x slower | ✅ | Postgres 1.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 841.2 | 119.0 | 105.2x slower | ✅ | Postgres 1.4 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 834.2 | 118.0 | 106.1x slower | ✅ | Postgres 1.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 592.7 | 83.0 | 149.3x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 186.7 | 24.0 | 473.9x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 48.7 | 6.0 | 1815.9x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 29.8 | 3.7 | 2971.4x slower | ✅ | Postgres 1.9 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[How this case works, and how to run it →](./cases/erc20-transfer-events/README.md)


### External Contract Calls

Not everything an indexer needs is in the logs. Every approval on the eight busiest ERC-20s is followed by a read of the allowance at that block: 15,703 calls, 200ms each, answered by the benchmark so every tool waits the same. Nothing limits how many a tool may have outstanding, so the rows differ by how many of those waits it takes at once.

<!-- BENCHMARK:erc20-allowance-calls:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,797.5 | 843.6 | — | ✅ | Postgres 8.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 12,421.9 | 818.9 | — | ✅ | Postgres 8.3 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,723.2 | 495.2 | 1.7x slower | ✅ | Postgres 7.3 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,068.9 | 456.5 | 1.8x slower | ✅ | Postgres 7.3 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 2,136.8 | 152.4 | 6x slower | ✅ | Postgres 8.6 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,295.0 | 80.6 | 9.9x slower | ✅ | Postgres 8.2 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 1,041.4 | 58.8 | 12.3x slower | ✅ | Postgres 8.5 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 825.4 | 43.7 | 15.5x slower | ✅ | Postgres 8.4 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 69.3 | 4.3 | 184.6x slower | ✅ | Postgres 20.0 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 39.8 | 2.8 | 321.6x slower | ❓ (1) | Postgres ~11.7 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4.4 | 0.3 | 2931.9x slower | ❓ (2) | Postgres ~16.7 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | — | — | — | — (3) | — |

> **(1)** Ponder — missing 37% of the data: the verification range was not finished within 300s
> **(2)** SubQuery — missing 93% of the data: the verification range was not finished within 300s
> **(3)** Substreams — its contract calls run against the Substreams server's own node, not a given endpoint
<!-- BENCHMARK:erc20-allowance-calls:END -->

[How this case works, and how to run it →](./cases/erc20-allowance-calls/README.md)


### Factory Contract Registration

What happens when you do not know the contracts up front? The indexer watches the Safe proxy factories, and every one of the 82,268 proxies they create becomes another contract it has to follow from that moment on.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 8,231.6 | 2,905.9 | — | ✅ | Postgres 14.0 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 7,012.0 | 2,475.4 | 1.2x slower | ✅ | Postgres 14.0 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 4,808.2 | 1,697.4 | 1.7x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 4,528.5 | 1,598.6 | 1.8x slower | ✅ | Postgres 11.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 3,646.0 | 1,304.4 | 2.3x slower | ❌ (1) | Postgres 13.8 MB |
| [Envio Subgraph](https://github.com/enviodev/hyperindex/releases/tag/v3.7.0-subgraph) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,543.3 | 1,250.9 | 2.3x slower | ✅ | Postgres 14.0 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 3,210.6 | 1,133.4 | 2.6x slower | ✅ | Postgres 11.4 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 274.4 | 83.4 | 30x slower | ❓ (2) | Postgres ~14.0 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 267.4 | 70.5 | 30.8x slower | ❓ (3) | Postgres ~25.3 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 266.7 | 66.5 | 30.9x slower | ❓ (4) | Postgres ~14.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 42.2 | 13.4 | 195.3x slower | ❓ (5) | Postgres ~38.0 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (6) | — |

> **(1)** Squid SDK — 921 of 927 safe setups missing; 10 of 11 fallback handler changes missing; 211 of 293 module enables missing
> **(2)** Squid SDK — missing 2.9% of the data: the verification range was not finished within 300s
> **(3)** Ponder — missing 5.3% of the data: the verification range was not finished within 300s
> **(4)** Substreams — missing 5.6% of the data: the verification range was not finished within 300s
> **(5)** Subgraph — missing 85% of the data: the verification range was not finished within 300s
> **(6)** SubQuery — indexed nothing in 300s, so there was no data to verify
<!-- BENCHMARK:safe-factory-registrations:END -->

[How this case works, and how to run it →](./cases/safe-factory-registrations/README.md)


### Solana USDC Transfers

Every USDC transfer on Solana, through the chain's busiest program. Solana makes that harder than it sounds: transfers hide inside swaps and routers, and many never say which token they moved. The scenario follows StreamingFast's [SPL token Substreams](https://github.com/streamingfast/substreams-solana-spl-token).

<!-- BENCHMARK:solana-spl-transfers:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 12,766.6 | 199.7 | — | ✅ | Postgres 37.8 MB |
| [Squid SDK](https://sqd.dev/sdk/) | [SQD Network](https://docs.sqd.dev/en/network/overview) | 8,719.4 | 272.9 | 1.5x slower | ✅ | Postgres 37.7 MB |
| [Substreams](https://substreams.dev) | [StreamingFast](https://docs.substreams.dev) | 3,856.5 | 126.9 | 3.3x slower | ✅ | Postgres 62.7 MB |
| [Carbon](https://github.com/sevenlabs-hq/carbon) | [RPC](https://solana.com/docs/rpc) | 563.2 | 18.9 | 22.7x slower | ✅ | Postgres 40.4 MB |
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
