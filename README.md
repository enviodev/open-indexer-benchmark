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
- [Ponder](https://ponder.sh/)
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

Results of indexing the Rocket Pool ERC20 token contract on mainnet from block 18,600,000. Write decoded event logs + aggregate account balances in a database.

This benchmark is inspired by the one used on the [Ponder landing page](https://ponder.sh/). And is a basic indexing case of a contract with densely populated events.

|        | Envio                 | Ponder           |
| ------ | --------------------- | ---------------- |
| blocks | 3,683,689 (61394.8/s) | 30,145 (502.4/s) |
| events | 481,773 (8029.6/s)    | 2,679 (44.6/s)   |

See the full breakdown in [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md).
