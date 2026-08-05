# Open Indexer Benchmark

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

An open, honest, and objective benchmark for blockchain indexers. Every result is reproducible from this repository, and contributions from any indexer team are welcome.

It began in May 2025 as a fork of [Sentio](https://sentio.xyz)'s research, which was later closed; [Envio](https://envio.dev) reopened and extended it. We are not affiliated with Sentio. The benchmark lives under the Envio organisation, but the goal is a fair comparison — see [METHODOLOGY.md](./METHODOLOGY.md) for how results are produced and what the table columns mean.


## State Aggregation

Balances and allowances over the Rocket Pool rETH contract: every event reads a row, changes it, and writes it back.

<!-- BENCHMARK:erc20-account-balances:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 17,767.6 | 129,946.8 | — | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 874.3 | 6,543.5 | 20.3x slower | ✅ | Postgres 2.2 MB |
| [Sqd](https://www.sqd.ai) | [SQD](https://docs.sqd.ai/subsquid-network/overview/) | 556.8 | 3,900.8 | 31.9x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 304.7 | 3,343.7 | 58.3x slower | ✅ | Postgres 4.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 61.8 | 813.7 | 287.5x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 33.2 | 437.1 | 535.3x slower | ✅ | Postgres 6.9 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 14.1 | 185.5 | 1261.2x slower | ✅ | Postgres 4.4 MB |
<!-- BENCHMARK:erc20-account-balances:END -->

[Details and setup →](./cases/erc20-account-balances/README.md)


## Decoded Event Stream

USDC transfers written once each, nothing aggregated and nothing read back — the ingestion path on its own.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 70,970.1 | 7,677.0 | — | ✅ | Postgres 1.4 MB |
| [Sqd](https://www.sqd.ai) | [SQD](https://docs.sqd.ai/subsquid-network/overview/) | 17,053.0 | 1,989.8 | 4.2x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 7,584.2 | 951.7 | 9.4x slower | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 839.8 | 118.8 | 84.5x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 219.3 | 27.9 | 323.6x slower | ✅ | Postgres 2.5 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 91.9 | 11.4 | 772.2x slower | ✅ | Postgres 2.8 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 19.7 | 2.4 | 3594.8x slower | ✅ | Postgres 1.9 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

[Details and setup →](./cases/erc20-transfer-events/README.md)


## Factory Contract Registration

The Safe proxy factories, plus every one of the 199,977 proxies they create — a contract set that is unknown at build time and grows throughout the run.

<!-- BENCHMARK:safe-factory-registrations:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 10,822.4 | 2,969.9 | — | ✅ | Postgres 4.6 MB |
| [Sqd](https://www.sqd.ai) | [SQD](https://docs.sqd.ai/subsquid-network/overview/) | 3,808.5 | 1,099.9 | 2.8x slower | ❌ (1) | Postgres 4.5 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,623.9 | 720.1 | 4.1x slower | ✅ | Postgres 4.6 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 171.1 | 61.0 | 63.2x slower | ✅ | Postgres 8.0 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 45.3 | 16.1 | 239.1x slower | ✅ | Postgres 9.5 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ❓ (2) | — |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | — | — | — | — (3) | — |

> **(1)** Sqd — 255 of 256 safe setups missing; 2 of 2 fallback handler changes missing; 57 of 64 module enables missing
> **(2)** SubQuery — did not finish the verification range within 1200s
> **(3)** Rindexer — its factory filter takes one factory per contract — `Contract using factory filter must use same factory across all networks` — so the children of Safe's four canonical factory deployments cannot be collected into one contract, and its no-code mode names tables after events, which leaves no way to declare the eight events Safe emits under one topic in two layouts
<!-- BENCHMARK:safe-factory-registrations:END -->

[Details and setup →](./cases/safe-factory-registrations/README.md)


## Sentio Benchmark Cases, May 2025

Six scenarios from the original research, kept for reference. These are total sync times rather than throughput rates, and predate the current methodology.

| Case                   | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio_Subgraph | Goldsky_Subgraph |
| ---------------------- | ------ | --------------- | ---------------- | ------ | -------- | -------- | --------------- | ---------------- |
| case_1_lbtc_event_only | 8m     |                 | 3m               | 1h40m  | 10m      | 3h9m     | 2h36m           |                  |
| case_2_lbtc_full       | 6m     |                 | 1m               | 45m    | 34m      | 1h3m     | 56m             |                  |
| case_3_ethereum_block  | 18m    | 7.9s            |                  | 33m    | 1m‡      | 10m      | 15m             |                  |
| case_4_on_transaction  | 17m    | 1m26s           |                  | 33m    | 7m       | N/A      |                 |                  |
| case_5_on_trace        | 16m    | 41s             |                  | N/A§   | 2m       | 8m       | 1h21m           |                  |
| case_6_template        | 19m    |                 | 8s               | 21m    | 2m       | 19m      | 10m             | 20h24m           |

[Details →](./sentio-benchmarks-may-2025/README.md)


## Running the benchmarks

Each scenario runs on its own — see its page above — or all of them in CI order:

```bash
ENVIO_API_TOKEN=your-token SQD_API_KEY=your-key node scripts/run-benchmarks.ts
```

Arguments pass through to each scenario: `node scripts/run-benchmarks.ts envio ponder --duration=100` picks indexers and the window, and `--cases=erc20-transfer-events` picks scenarios. The [Envio](https://envio.dev) token supplies the RPC endpoint and ground truth; the [SQD](https://portal.sqd.dev) key is needed only for the Sqd implementation.


## Contributing

Open an issue or pull request to add an indexer, add a scenario, report a result that looks wrong, or improve the methodology. Questions: [Discord](https://discord.com/invite/envio) or [Telegram](https://t.me/+kAIGElzPjApiMjI0).

> Benchmark data on the [Envio landing page](https://envio.dev) and in [Best Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026) comes from this repository.
