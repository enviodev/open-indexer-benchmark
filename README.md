# Open Indexer Benchmark

[![Discord](https://img.shields.io/badge/Discord-Join%20Chat-7289da?logo=discord&logoColor=white)](https://discord.com/invite/envio)

An open, honest, and objective benchmark for blockchain indexers. All results are publicly verifiable, all code is open, and contributions are welcome.

This repository is maintained by [Envio](https://envio.dev) but aims to be objective and fair. If you want to add a new use case, indexer, or correction, open an issue or pull request.

> All benchmark data referenced on the [Envio landing page](https://envio.dev) and in the [Best Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026) comparison article comes from this repository.

---

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

---

## Methodology

**Backfill speed**: each indexer runs for exactly 1 minute. We measure how many blocks and events were indexed per second. Results are sorted by the most efficient indexer in each category.

All benchmarks run on standardised hardware. RPC provider: Alchemy Growth tier when built-in RPC support is unavailable.

You can enter the `cases` directory to see code, setup instructions, and run the benchmarks yourself.

---

## Results

### ERC-20 Transfer Events

Results of indexing the Rocket Pool ERC20 token contract on Ethereum Mainnet. Stores decoded event logs and aggregates account balances. Inspired by the benchmark used on the [Ponder landing page](https://ponder.sh).

| Indexer | Blocks (blocks/s) | Events (events/s) | vs Envio |
|---|---|---|---|
| Envio | 4,630,634 (77,177/s) | 599,038 (9,984/s) | baseline |
| SQD | 780,390 (13,007/s) | 97,631 (1,627/s) | 5.9x slower |
| Envio RPC | 245,999 (4,100/s) | 29,529 (492/s) | 18.8x slower |
| rindexer | 163,812 (2,730/s) | 12,435 (207/s) | 28.3x slower |
| Ponder | 30,131 (502/s) | 2,663 (44/s) | 153.7x slower |
| SubQuery | 13,566 (226/s) | 1,320 (22/s) | 341.3x slower |

See the full breakdown in [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md).

---

### Sentio Benchmark Cases

Six real-world indexing scenarios covering events, blocks, transactions, and traces on Ethereum Mainnet.

| Case | Description |
|---|---|
| case_1_lbtc_event_only | Simple event indexing of LBTC token transfers. No RPC calls, write-only. |
| case_2_lbtc_full | Complex indexing with RPC calls for token balances and point calculation. Read-after-write. |
| case_3_ethereum_block | Block-level indexing of Ethereum blocks and metadata extraction. |
| case_4_on_transaction | Transaction gas usage indexing. |
| case_5_on_trace | Uniswap V2 transaction trace analysis. Swap decoding from execution traces. |
| case_6_template | Uniswap V2 factory template benchmark. Pair creation and swap event analysis. |

| Case | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio Subgraph | Goldsky Subgraph |
|---|---|---|---|---|---|---|---|---|
| case_1_lbtc_event_only | 8m | 3m | 1h 40m | 10m | 3h 9m | 2h 36m | | |
| case_2_lbtc_full | 6m | 1m | 45m | 34m | 1h 3m | 56m | | |
| case_3_ethereum_block | 18m | 7.9s | 33m | 1m | 10m | 15m | | |
| case_4_on_transaction | 17m | 1m 26s | 33m | 7m | N/A | | | |
| case_5_on_trace | 16m | 41s | N/A | 2m | 8m | 1h 21m | | |
| case_6_template | 19m | 8s | 21m | 2m | 19m | 10m | 20h 24m | |

See the full breakdown in [./sentio-benchmarks-may-2025/README.md](./sentio-benchmarks-may-2025/README.md).

---

### Uniswap V2 Factory, May 2025

| Indexer | Time to complete | vs HyperIndex |
|---|---|---|
| Envio HyperIndex | 1 minute | baseline |
| Subsquid | 15 minutes | 15x slower |
| The Graph | 2 hours 23 minutes | 143x slower |
| Ponder | 2 hours 38 minutes | 158x slower |

Benchmark originally run by [Sentio](https://sentio.xyz) in May 2025. Full breakdown in [./sentio-benchmarks-may-2025/README.md](./sentio-benchmarks-may-2025/README.md).

---

## Background

This project started in May 2025 as a fork of Sentio's research on blockchain indexer performance. The original repository was later closed and only the fork remained. Envio has since reopened and extended the benchmark to cover new use cases and keep results current as indexers evolve.

We are not affiliated with Sentio. A few changes were made to the original codebase to make Envio usage more idiomatic. The SQD team made similar adjustments for their implementation.

Even though this benchmark now lives under the Envio organisation, the goal is objective and fair comparisons. Contributions from any indexer team are welcome.

---

## Running the benchmarks

See the README in each case directory for setup instructions and requirements:

- [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md)
- [./sentio-benchmarks-may-2025/README.md](./sentio-benchmarks-may-2025/README.md)

---

## Contributing

Contributions are welcome. Open an issue or pull request to add a new indexer, add a new benchmark scenario, report a result that looks incorrect, or improve methodology.

---

## Related

- [Envio HyperIndex](https://github.com/enviodev/hyperindex)
- [Best Blockchain Indexers in 2026](https://docs.envio.dev/blog/best-blockchain-indexers-2026)
- [Envio Docs](https://docs.envio.dev)

## Support

- [Discord community](https://discord.com/invite/envio)
- Telegram community](https://t.me/+kAIGElzPjApiMjI0)
