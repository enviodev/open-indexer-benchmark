# Open Indexer Benchmark

An open, honest, and objective benchmark for blockchain indexers (EVM, Solana, and more). We compare historical backfill speed, latency, data storage, DX, and anything else you find important. Contributions welcome!

## Introduction

The project started in May 2025 as a fork of [Sentio](https://sentio.xyz) research on blockchain indexer performance. See it here: [./sentio-benchmarks-may-2025/README.md](./sentio-benchmarks-may-2025/README.md). We are not affiliated with Sentio and committed a few changes to the codebase to make [Envio](https://envio.dev) usage more idiomatic. [SQD](https://www.sqd.ai) team did the same. After this, the original repository was closed and only the fork remained.

Now, after almost a year without updates, many projects have evolved and new problems have emerged. We are reopening the project to compare the performance of indexers on new use cases. Even though this benchmark now lives under the [Envio](https://envio.dev) organization, we aim to be objective and fair in our comparisons.

## How to contribute

We are open to contributions! If you want to add a new use case, please open an issue or a pull request.

## Featured Projects

> In alphabetical order

- [Envio](https://envio.dev)
- [Goldsky](https://goldsky.com/)
- [Ponder](https://ponder.sh/)
- [rindexer](https://rindexer.xyz/)
- [Sentio](https://sentio.xyz/)
- [SQD](https://www.sqd.ai)
- [SubQuery](https://subquery.network/)
- [TheGraph](https://thegraph.com/)

## Cases

For every case we run the following benchmarks:

- Backfill speed - we run every indexer for exactly 1 minute and measure how many blocks and events were indexed per second

The results are sorted by the most efficient indexer in each category.

You can enter the cases directory to see a detailed breakdown of each case, see code and run benchmarks yourself.

### [ERC20 Transfer Events](./cases/erc20-transfer-events/README.md)

Results of indexing the Rocket Pool ERC20 token contract on Ethereum Mainnet. Store decoded event logs + aggregate account balances.

This benchmark is inspired by the one used on the [Ponder landing page](https://ponder.sh/). It's the most basic indexing case of a single contract.

<!-- BENCHMARK:erc20-transfer-events:START -->
| | Envio | Sqd (6.9x slower) | Rindexer (17.3x slower) | Envio - RPC (25.9x slower) | Ponder (182.6x slower) | SubQuery (336.3x slower) |
| --- | --- | --- | --- | --- | --- | --- |
| blocks | 4,980,121 (83002.0/s) | 722,324 (12038.7/s) | 288,441 (4807.4/s) | 191,999 (3200.0/s) | 27,271 (454.5/s) | 14,810 (246.8/s) |
| events | 676,025 (11267.1/s) | 93,841 (1564.0/s) | 33,343 (555.7/s) | 14,654 (244.2/s) | 2,388 (39.8/s) | 1,425 (23.8/s) |
<!-- BENCHMARK:erc20-transfer-events:END -->

See the full breakdown in [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md).

### [2025 Sentio Benchmarks](./sentio-benchmarks-april-2025/README.md)

| Case                   | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio_Subgraph | Goldsky_Subgraph |
| ---------------------- | ------ | --------------- | ---------------- | ------ | -------- | -------- | --------------- | ---------------- |
| case_1_lbtc_event_only | 8m     |                 | 3m               | 1h40m  | 10m      | 3h9m     | 2h36m           |                  |
| case_2_lbtc_full       | 6m     |                 | 1m               | 45m    | 34m      | 1h3m     | 56m             |                  |
| case_3_ethereum_block  | 18m    | 7.9s            |                  | 33m    | 1m‡      | 10m      | 15m             |                  |
| case_4_on_transaction  | 17m    | 1m26s           |                  | 33m    | 7m       | N/A      |                 |                  |
| case_5_on_trace        | 16m    | 41s             |                  | N/A§   | 2m       | 8m       | 1h21m           |                  |
| case_6_template        | 19m    |                 | 8s               | 21m    | 2m       | 19m      | 10m             | 20h24m           |

See the full breakdown in [./sentio-benchmarks-april-2025/README.md](./sentio-benchmarks-april-2025/README.md).
