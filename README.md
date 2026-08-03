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


## Scenarios

### State Aggregation

Derived state that every event updates — the indexer must read a row, apply a change, and write it back, so throughput depends on how well it handles read-after-write, not just ingestion. Account balances and allowances over the Rocket Pool rETH contract on Ethereum Mainnet. Inspired by the benchmark used on the [Ponder landing page](https://ponder.sh).

<!-- BENCHMARK:erc20-account-balances:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 14,006.7 | 98,566.1 | — | ✅ | Postgres 2.2 MB |
| [Sqd](https://www.sqd.ai) | [SQD](https://docs.sqd.ai/subsquid-network/overview/) | 786.2 | 5,210.9 | 17.8x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 386.1 | 5,046.1 | 36.3x slower | ✅ | Postgres 4.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 70.9 | 793.4 | 197.4x slower | ✅ | Postgres 2.3 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 61.5 | 810.0 | 227.7x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 43.9 | 577.5 | 319.4x slower | ✅ | Postgres 6.9 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 25.5 | 335.4 | 549.9x slower | ✅ | Postgres 4.4 MB |
<!-- BENCHMARK:erc20-account-balances:END -->

See the full breakdown in [./cases/erc20-account-balances/README.md](./cases/erc20-account-balances/README.md).


### Decoded Event Stream

Every decoded event written once, with no aggregation and nothing to read back — the ingestion path on its own. Transfer events from the USDC contract on Ethereum Mainnet.

<!-- BENCHMARK:erc20-transfer-events:START -->
| tool | source | events/s | blocks/s | vs best | data | storage |
| --- | --- | --- | --- | --- | --- | --- |
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 72,222.5 | 7,783.5 | — | ✅ | Postgres 1.4 MB |
| [Sqd](https://www.sqd.ai) | [SQD](https://docs.sqd.ai/subsquid-network/overview/) | 15,339.4 | 1,908.6 | 4.7x slower | ✅ | Postgres 1.4 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 6,833.7 | 847.8 | 10.6x slower | ✅ | Postgres 3.4 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 2,159.4 | 274.6 | 33.4x slower | ✅ | Postgres 1.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 183.3 | 22.5 | 393.9x slower | ✅ | Postgres 2.5 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 17.0 | 2.1 | 4259.2x slower | ✅ | Postgres 1.9 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 0.0 | 0.0 | — | ✅ | Postgres 2.8 MB |
<!-- BENCHMARK:erc20-transfer-events:END -->

See the full breakdown in [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md).


### Factory Contract Registration

A contract set that is not known at build time and grows to six figures during the run — the indexer discovers each child from a factory event and must index it from then on, so throughput depends on how per-contract bookkeeping and log matching scale. The canonical Safe proxy factories on Ethereum Mainnet, verified over a range that ends at their 25,096th proxy and measured on to block 24,660,000, where the registered set is 199,977 deep. `proxy` became an indexed argument in Safe 1.4.1, so the same event signature arrives in two layouts and both have to be decoded.

Safe emits a proxy's `SafeSetup` one log index *below* the `ProxyCreation` announcing it, so the child's event precedes its own registration. Tools that resolve the factory's child set before matching capture those 256 rows; tools that discover children strictly in event order cannot. Both are legitimate designs, and the note under the table says which a tool chose.

<!-- BENCHMARK:safe-factory-registrations:START -->
_No results collected yet — the table is filled in by the next benchmark run._
<!-- BENCHMARK:safe-factory-registrations:END -->

See the full breakdown in [./cases/safe-factory-registrations/README.md](./cases/safe-factory-registrations/README.md).


## Methodology

Each scenario runs in two phases.

**Verification**: the indexer indexes a fixed block range to completion, then its database is checked against ground truth and measured on disk. Both are only comparable when every indexer holds identical data — which a fixed block range guarantees and a fixed time window does not.

**Throughput**: the indexer re-runs from a clean database for 100 seconds, stopping just short of the chain head so the measurement stays in backfill rather than drifting into head tracking. The window runs twice and the better rate is reported, since contention on a shared CI runner only ever costs throughput. Indexers too slow to finish the verification range within the window skip this phase and report their rate from that run instead.

**Data correctness**: ground truth is built from [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) logs by replaying each scenario's documented logic, then compared against the indexer's own database by a checksum that ignores row order but catches missing rows, duplicated rows, and wrong values. ✅ every entity matched, ❌ the data disagrees, ❓ the check could not run; the latter two carry a numbered note below the table.

**Storage**: on-disk size of the tables the scenario defines, including their indexes, at the data state the verification phase produces. Each tool's internal bookkeeping is excluded, since it varies with how much a tool caches or retains.

**Source**: where a tool reads chain data. A tool is benchmarked once per source it supports, so a fast tool on a slow source is not mistaken for a slow tool — Envio Indexer supports both HyperSync and RPC and so appears twice. SQD reads the SQD network; tools without their own pipeline read [Envio HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc).

All benchmarks run in GitHub CI on `ubuntu-latest` runners, one job per tool per source per scenario, each running the command that tool's own documentation recommends for production.


## Sentio Benchmark Cases, May 2025

Six real-world indexing scenarios covering events, blocks, transactions, and traces on Ethereum Mainnet. These figures come from the original May 2025 research and predate the methodology above — they are total sync times, not throughput rates, and are kept for reference rather than re-run.

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

Each scenario directory holds the implementations, setup instructions and requirements, and can be run yourself:

- State Aggregation — [./cases/erc20-account-balances/](./cases/erc20-account-balances/README.md)
- Decoded Event Stream — [./cases/erc20-transfer-events/](./cases/erc20-transfer-events/README.md)
- Factory Contract Registration — [./cases/safe-factory-registrations/](./cases/safe-factory-registrations/README.md)
- Sentio Benchmark Cases, May 2025 — [./sentio-benchmarks-may-2025/](./sentio-benchmarks-may-2025/README.md)

To run every scenario in one go, sequentially and in the same order as CI:

```bash
ENVIO_API_TOKEN=your-token SQD_API_KEY=your-key node scripts/run-benchmarks.ts
```

It needs the same credentials as the scenarios it runs — an [Envio](https://envio.dev) API token, and an [SQD](https://portal.sqd.dev) API key for the Sqd implementation — and forwards its arguments to each scenario, so `node scripts/run-benchmarks.ts envio ponder --duration=100` selects indexers and the window exactly as running a scenario directly does. Limit it to some scenarios with `--cases=erc20-transfer-events`.


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
