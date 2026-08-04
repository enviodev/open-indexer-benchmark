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
| [Envio Indexer](https://envio.dev) | [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) | 17,767.6 | 129,946.8 | — | ✅ | Postgres 2.2 MB |
| [Envio Indexer](https://envio.dev) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 874.3 | 6,543.5 | 20.3x slower | ✅ | Postgres 2.2 MB |
| [Sqd](https://www.sqd.ai) | [SQD](https://docs.sqd.ai/subsquid-network/overview/) | 556.8 | 3,900.8 | 31.9x slower | ✅ | Postgres 2.2 MB |
| [Rindexer](https://rindexer.xyz) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 304.7 | 3,343.7 | 58.3x slower | ✅ | Postgres 4.4 MB |
| [Ponder](https://ponder.sh) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 61.8 | 813.7 | 287.5x slower | ✅ | Postgres 3.3 MB |
| [Subgraph](https://thegraph.com) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 33.2 | 437.1 | 535.3x slower | ✅ | Postgres 6.9 MB |
| [SubQuery](https://subquery.network) | [RPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc) | 14.1 | 185.5 | 1261.2x slower | ✅ | Postgres 4.4 MB |
<!-- BENCHMARK:erc20-account-balances:END -->

See the full breakdown in [./cases/erc20-account-balances/README.md](./cases/erc20-account-balances/README.md).


### Decoded Event Stream

Every decoded event written once, with no aggregation and nothing to read back — the ingestion path on its own. Transfer events from the USDC contract on Ethereum Mainnet.

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

See the full breakdown in [./cases/erc20-transfer-events/README.md](./cases/erc20-transfer-events/README.md).


### Factory Contract Registration

Contracts that are not known at build time. The indexer watches the Safe proxy factories on Ethereum Mainnet, and every proxy they announce becomes a contract it must index from then on — 199,977 of them over the range. What is measured is how per-contract bookkeeping and log matching hold up as that set grows.

Two details separate the tools. `ProxyCreation` arrives in two layouts under one event signature, so both have to be decoded. And a new proxy emits its `SafeSetup` one log index *before* the `ProxyCreation` announcing it, so tools that resolve the child set up front capture those 10,524 rows and tools that discover children in event order cannot — both legitimate, and the note under the table says which a tool chose.

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

See the full breakdown in [./cases/safe-factory-registrations/README.md](./cases/safe-factory-registrations/README.md).


## Methodology

Each scenario runs twice. Once over a fixed block range, to check the indexer's data against ground truth and measure it on disk. Once as a timed window, to measure how fast it goes. Everything runs in GitHub CI on `ubuntu-latest`, one job per tool per source, each started the way that tool's own documentation recommends for production.

What the columns mean:

**events/s, blocks/s** — measured over a 100-second window that stops short of the chain head, so it is backfill speed rather than head tracking. The window runs twice and the better rate is reported. A tool too slow to get through the fixed range in that time reports the rate it managed there instead.

**data** — ✅ every row matches ground truth, ❌ it does not, ❓ only part of the range got indexed, or the check could not run. Ground truth is built by replaying each scenario's documented logic over [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) logs. Anything but ✅ carries a numbered note under the table.

**storage** — the scenario's own tables and indexes, excluding each tool's internal bookkeeping. A `~` means the tool covered part of the range and the figure is scaled up from what it did index.

**source** — where the tool reads chain data. A tool is benchmarked once per source it supports, so a fast tool on a slow source is not mistaken for a slow tool. SQD reads the SQD network; tools without their own pipeline read [Envio HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc).

The verification run is capped at ten minutes. An indexer that has not finished by then is stopped there and verified on what it indexed, so it still gets a rate and a note saying how much data is missing.


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
