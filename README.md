# Open Indexer Benchmark

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

An open, honest, and objective benchmark for blockchain indexers. All results are publicly verifiable, all code is open, and contributions are welcome.

This project started in May 2025 as a fork of [Sentio](https://sentio.xyz)'s research on blockchain indexer performance. The original repository was later closed and only the fork remained. [Envio](https://envio.dev) has since reopened and extended the benchmark to cover new use cases and keep results current as indexers evolve.

We are not affiliated with [Sentio](https://sentio.xyz). A few changes were made to the original codebase to make [Envio](https://envio.dev) usage more idiomatic. The [SQD](https://www.sqd.ai) team made similar adjustments for their implementation.

Even though this benchmark now lives under the [Envio](https://envio.dev) organisation, the goal is objective and fair comparisons. Contributions from any indexer team are welcome.


## Featured Indexers

Indexers included in this benchmark (alphabetical order):

- [Envio](https://envio.dev)
- [Goldsky](https://goldsky.com)
- [Ponder](https://ponder.sh)
- [rindexer](https://rindexer.xyz)
- [Sentio](https://sentio.xyz)
- [SQD](https://www.sqd.ai)
- [SubQuery](https://subquery.network)
- [The Graph](https://thegraph.com)


## Methodology

**Backfill speed**: each indexer runs for 60 seconds (SubQuery runs for 180s to amortise its slower startup; the summary divides by each indexer's actual duration). We measure how many blocks and events were indexed per second. Results are sorted by the most efficient indexer in each category.

All benchmarks run in GitHub CI on `ubuntu-latest` runners. Indexers without built-in data source support use [Envio HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) as the RPC provider.

You can enter the `cases` directory to see code, setup instructions, and run the benchmarks yourself.


## Results

### ERC-20 Account Balances

Results of indexing the Rocket Pool ERC20 token contract on Ethereum Mainnet. Stores decoded event logs and aggregates account balances. Inspired by the benchmark used on the [Ponder landing page](https://ponder.sh).

<!-- BENCHMARK:erc20-account-balances:START -->
| | Envio | Sqd (12.0x slower) | Rindexer (30.1x slower) | Envio - RPC (31.9x slower) | Ponder (234.9x slower) | SubQuery (36754.8x slower) |
| --- | --- | --- | --- | --- | --- | --- |
| blocks/s | 121,290.9 | 10,142.0 | 4,030.0 | 3,800.0 | 516.3 | 3.3 |
| events/s | 17,403.9 | 1,395.9 | 300.0 | 404.7 | 45.6 | 0.1 |
<!-- BENCHMARK:erc20-account-balances:END -->

See the full breakdown in [./cases/erc20-account-balances/README.md](./cases/erc20-account-balances/README.md).


### ERC-20 Transfer Events

Results of indexing raw Transfer event logs from the USDC token contract on Ethereum Mainnet, starting at block 18,600,000. Stores every decoded Transfer event with no aggregation — a pure write-only ingestion throughput test.

<!-- BENCHMARK:erc20-transfer-events:START -->
| | Envio | Sqd (2.8x slower) | Envio - RPC (53.2x slower) | Ponder (283.9x slower) | SubQuery (1622.5x slower) |
| --- | --- | --- | --- | --- | --- |
| blocks/s | 5,678.7 | 2,063.1 | 106.7 | 20.0 | 3.5 |
| events/s | 49,798.5 | 16,803.2 | 742.3 | 162.8 | 28.7 |
<!-- BENCHMARK:erc20-transfer-events:END -->

See the full breakdown in [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md).


### Sentio Benchmark Cases, May 2025

Six real-world indexing scenarios covering events, blocks, transactions, and traces on Ethereum Mainnet.

| Case | Description |
|---|---|
| case_1_lbtc_event_only | Simple event indexing of LBTC token transfers. No RPC calls, write-only. |
| case_2_lbtc_full | Complex indexing with RPC calls for token balances and point calculation. Read-after-write. |
| case_3_ethereum_block | Block-level indexing of Ethereum blocks and metadata extraction. |
| case_4_on_transaction | Transaction gas usage indexing. |
| case_5_on_trace | Uniswap V2 transaction trace analysis. Transaction trace handling, swap decoding. |
| case_6_template | Uniswap V2 template benchmark. Event handling, pair and swap analysis. |

| Case                   | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio_Subgraph | Goldsky_Subgraph |
| ---------------------- | ------ | --------------- | ---------------- | ------ | -------- | -------- | --------------- | ---------------- |
| case_1_lbtc_event_only | 8m     |                 | 3m               | 1h40m  | 10m      | 3h9m     | 2h36m           |                  |
| case_2_lbtc_full       | 6m     |                 | 1m               | 45m    | 34m      | 1h3m     | 56m             |                  |
| case_3_ethereum_block  | 18m    | 7.9s            |                  | 33m    | 1m‡      | 10m      | 15m             |                  |
| case_4_on_transaction  | 17m    | 1m26s           |                  | 33m    | 7m       | N/A      |                 |                  |
| case_5_on_trace        | 16m    | 41s             |                  | N/A§   | 2m       | 8m       | 1h21m           |                  |
| case_6_template        | 19m    |                 | 8s               | 21m    | 2m       | 19m      | 10m             | 20h24m           |

See the full breakdown in [./sentio-benchmarks-may-2025/README.md](./sentio-benchmarks-may-2025/README.md).


## Running the benchmarks

See the README in each case directory for setup instructions and requirements:

- [./cases/erc20-account-balances/README.md](./cases/erc20-account-balances/README.md)
- [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md)
- [./sentio-benchmarks-may-2025/README.md](./sentio-benchmarks-may-2025/README.md)


## Contributing

Contributions are welcome. Open an issue or pull request to add a new indexer, add a new benchmark scenario, report a result that looks incorrect, or improve methodology.


## Related

- [Envio HyperIndex](https://github.com/enviodev/hyperindex)
- [Best Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026)
- [Envio Docs](https://docs.envio.dev)

> All benchmark data referenced on the [Envio landing page](https://envio.dev) and in the [Best Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026) comparison article comes from this repository.

## Support

- [Discord community](https://discord.com/invite/envio)
- [Telegram community](https://t.me/+kAIGElzPjApiMjI0)
