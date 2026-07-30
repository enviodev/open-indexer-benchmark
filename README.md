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

Each case runs in two phases.

**Verification**: the indexer indexes a small fixed block range to completion. Its database is then checked against ground truth and measured on disk. Both are only comparable when every indexer holds identical data, which a fixed block range guarantees and a fixed time window does not.

**Throughput**: the indexer re-runs from a clean database for 60 seconds, stopping early at a block just short of the chain head so the measurement stays in the backfill path instead of drifting into head tracking. The window is run twice and the better rate reported — a single window on a shared CI runner varies enough to reorder the middle of the table, and contention only ever costs throughput, so the faster sample is the one least distorted by it. Indexers that took longer than the window to index the verification range skip this phase; their rate comes from that run, where the block and event counts are known exactly.

**Data correctness**: ground truth is built from [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) logs by replaying each case's documented logic, and is committed as `expected.json` in the case directory. Rather than storing every expected row, each entity is reduced to a row count and a checksum: every row is encoded canonically, hashed, and the hashes summed. The result is independent of row order but still catches missing rows, duplicated rows, and wrong values. The identical encoding is computed in SQL against the indexer's own database, and the two must agree exactly. ✅ means every entity matched. ❌ means the data disagrees and ❓ means the check could not run; both carry a numbered reference to the exact reason below the table.

**Storage**: size on disk of the tables the case defines, including their indexes, at the identical data state the verification phase produces, prefixed with the storage engine. Each tool's internal bookkeeping is recorded in the run output rather than the table, since it varies with how much a tool caches or retains.

**Source**: where a tool reads chain data from. Tools with their own pipeline use it — Envio reads HyperSync, SQD reads the SQD network — and everything else reads a plain RPC endpoint, which is [Envio HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) here. Envio appears twice, once per source, which isolates the data source from the tool: the same indexer against HyperSync and against a plain RPC endpoint.

All benchmarks run in GitHub CI on `ubuntu-latest` runners, one job per tool per case.

One caveat worth stating plainly: Ponder runs under `ponder dev` rather than `ponder start`. Its documented production command exits immediately under the flags used here, and `dev` watches the filesystem and hot-reloads, so Ponder carries overhead no other tool's invocation does. Its throughput is not a like-for-like comparison until that is resolved.

You can enter the `cases` directory to see code, setup instructions, and run the benchmarks yourself.


## Results

### ERC-20 Account Balances

Results of indexing the Rocket Pool ERC20 token contract on Ethereum Mainnet. Stores decoded event logs and aggregates account balances. Inspired by the benchmark used on the [Ponder landing page](https://ponder.sh).

<!-- BENCHMARK:erc20-account-balances:START -->
_Awaiting the first run under the two-phase methodology._
<!-- BENCHMARK:erc20-account-balances:END -->

See the full breakdown in [./cases/erc20-account-balances/README.md](./cases/erc20-account-balances/README.md).


### ERC-20 Transfer Events

Results of indexing raw Transfer event logs from the USDC token contract on Ethereum Mainnet, starting at block 18,600,000. Stores every decoded Transfer event with no aggregation — a pure write-only ingestion throughput test.

<!-- BENCHMARK:erc20-transfer-events:START -->
_Awaiting the first run under the two-phase methodology._
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
