# Indexer Benchmarks

This repository contains performance benchmarks for various blockchain indexers, comparing their capabilities and performance across different indexing scenarios.

## Benchmark Cases

| Case                                                | Description                                                              | Features                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [case_1_lbtc_event_only](./case_1_lbtc_event_only/) | Simple event indexing of LBTC token transfers                            | Event handling, No RPC calls, Write-only operations                       |
| [case_2_lbtc_full](./case_2_lbtc_full/)             | Complex indexing with RPC calls for token balances and point calculation | Event handling, RPC calls, Read-after-write operations, Point calculation |
| [case_3_ethereum_block](./case_3_ethereum_block/)   | Block-level indexing of Ethereum blocks                                  | Block handling, Metadata extraction                                       |
| [case_4_on_transaction](./case_4_on_transaction/)   | Transaction gas usage indexing                                           | Transaction handling, Gas calculations                                    |
| [case_5_on_trace](./case_5_on_trace/)               | Uniswap V2 transaction trace analysis                                    | Transaction trace handling, Swap decoding                                 |
| [case_6_template](./case_6_template/)               | Uniswap V2 template benchmark                                            | Event handling, Pair and swap analysis                                    |

## Latest Benchmark Results

Our most recent benchmark (April 2025) shows significant performance differences between indexers:

- **Fastest Event Processing**: Envio HyperIndex (2m) and Sentio (8m) for simple event indexing
- **Best RPC Performance**: Envio HyperIndex (3m) and Sentio (6m) for complex RPC interactions
- **Block Processing Leader**: Envio HyperSync (7.9s) and Sentio (18m) for block-level indexing
- **Transaction Processing**: Envio HyperSync (1m26s) and Subsquid (5m) for gas usage indexing
- **Trace Processing Leader**: Envio HyperSync (41s) and Subsquid (2m) for transaction trace analysis
- **Template Processing**: Envio HyperIndex (30s) and Subsquid (2m) for Uniswap V2 template indexing

See the [complete benchmark results](#current-benchmark-results---april-2025) for detailed timing data, completeness metrics, and analysis.

## Test Methodology

### Test Configuration

- All benchmarks run on standardized hardware environments
- Each test runs until completion or timeout (72 hours)
- RPC providers: When built-in RPC support isn't available, we use Alchemy Growth tier

### Test Case Design

Our benchmark cases are designed to test different aspects of indexer performance:

1. **Chain Selection**:
   - Ethereum Mainnet for all test cases

2. **Data Types**:

   - Events: Transfer events in case_1 and case_2
   - Blocks: Block data in case_3
   - Transactions: Gas usage in case_4
   - Traces: Uniswap V2 swap transactions in case_5

3. **RPC Patterns**:

   - No RPC: case_1 tests raw event processing
   - RPC Calls: case_2 tests balanceOf() calls
   - Block Data: case_3 tests block processing
   - Transaction Data: case_4 tests transaction processing
   - Trace Data: case_5 tests transaction trace processing
   - Template Data: case_6 tests factory contract event processing and pair creation tracking

4. **Write Patterns**:
   - Write-only: case_1 tests simple data storage
   - Read-after-write: case_2 tests database interaction complexity
   - Computational: case_2/case_4 tests calculation and derivation of metrics

## Indexer Platforms

### Platform Descriptions

- **Sentio**: The most comprehensive blockchain data platform with the widest chain support, offering both raw data access and indexing capabilities across multiple blockchain ecosystems
- **Envio HyperSync**: Envio's high-performance EVM based blockchain data engine that serves as a direct replacement for traditional RPC endpoints for raw blockchain data
- **Envio HyperIndex**: Built on top of HyperSync, providing a complete indexing framework with schema management, event handling, and GraphQL APIs
- **Ponder**: A framework for building and deploying blockchain data APIs
- **Subsquid**: A framework for building GraphQL APIs on top of blockchain data
- **Subgraph**: The Graph Protocol's indexing solution for building open APIs

### Use Cases

- Use HyperSync directly when you need raw blockchain data at maximum speed
- Use HyperIndex when you need a full-featured indexing solution

### Supported Chains

| Chain    | Sentio | Envio | Ponder | Subsquid | Subgraph |
| -------- | ------ | ----- | ------ | -------- | -------- |
| EVM\*    | ✅     | ✅    | ✅     | ✅       | ✅       |
| Sui      | ✅     | ❌    | ❌     | ❌       | ❌       |
| Aptos    | ✅     | ❌    | ❌     | ❌       | ❌       |
| StarkNet | ✅     | ❌    | ❌     | ✅       | ✅       |
| Cosmos   | ⚠️     | ❌    | ❌     | ❌       | ❌       |
| Solana   | ⚠️     | ❌    | ❌     | ✅       | ⚠️       |
| Bitcoin  | ⚠️     | ❌    | ❌     | ❌       | ✅       |
| Fuel     | ✅     | ✅    | ❌     | ✅       | ❌       |

\* Including many EVM-compatible L1/L2 chains

⚠️ Limited support

### Supported Features

| Feature | Sentio | Envio | Ponder | Subsquid | Subgraph |
|---------|--------|-------|--------|----------|----------|
| Event Handler | ✅ | ✅ | ✅ | ✅ | ✅ |
| Block Handler | ✅ | ⚠️$ | ✅ | ✅ | ✅ |
| Transaction Handler | ✅ | ⚠️$ | ✅ | ✅ | ❌ |
| Trace/Internal Tx Handler | ✅ | ⚠️$ | ❌ | ✅$$ | ⚠️† |
| Native RPC | ✅ | ⚠️$ | ❌ | ❌ | ❌ |
| SQL Querying | ✅ | ✅ | ✅ | ✅ | ❌ |
| GraphQL API | ✅ | ✅ | ✅ | ❌ | ✅ |
| Decentralized Network | ❌ | ❌ | ❌ | ✅ | ✅ |
| Factory Template Dynamic Registation | ✅ | ✅ | ✅ | ⚠️* | ✅ |
| Batch RPC calls | ✅^ | ✅^ | ✅^ | ✅^ | ❌ |

⚠️ Limited capability or requires additional configuration

$ Envio does not support natively, but one can utilize HyperSync to retrieve data, but it requires manual decoding and client-side processing of reorgs.

/$$ Subsquid does have access internal call trace as bytes, however, it requires manual decoding

† Subgraph has limited internal transaction visibility, only detecting direct contract calls, not internal transactions. This leads to incomplete data (~40% fewer records) and inaccurate sender identification in trace-level indexing as documented in the [case_5_on_trace](./case_5_on_trace/) benchmark.

\* Subsquid requires manual configuration updates at fixed blocks to optimize template indexing, with limitations on the number of contracts (up to tens of thousands) and requiring periodic maintenance to minimize sync overhead.

^ Rely on multicall contract deployed by MakerDAO for batch RPC calls, with Envio using built-in platform infrastructure and others using multicall

This benchmark provides a comparative analysis of indexer performance across different scenarios, helping developers choose the most appropriate indexing solution for their specific needs.

## Current Benchmark Results - April 2025

### Test Data

| Case                   | Description                    | Chain    | Block Range          | Features                                                       |
| ---------------------- | ------------------------------ | -------- | -------------------- | -------------------------------------------------------------- |
| case_1_lbtc_event_only | LBTC Token Transfer Events     | Ethereum | 0 to 22200000        | Event handling, No RPC calls, Write-only                       |
| case_2_lbtc_full       | LBTC Token with RPC calls      | Ethereum | 22400000 to 22500000 | Event handling, RPC calls, Read-after-write, Point calculation |
| case_3_ethereum_block  | Ethereum Block Processing      | Ethereum | 0 to 100000          | Block handling, Metadata extraction                            |
| case_4_on_transaction  | Ethereum Transaction Gas Usage | Ethereum | 22280000 to 22290000 | Transaction handling, Gas calculations                         |
| case_5_on_trace        | Uniswap V2 Swap Trace Analysis | Ethereum | 22200000 to 22290000 | Transaction trace handling, Swap decoding                      |
| case_6_template        | Uniswap V2 Template            | Ethereum | 19000000 to 19010000 | Event handling, Pair and swap analysis                         |

### Performance Results

| Case                   | Sentio | Envio HyperSync | Envio HyperIndex | Ponder | Subsquid | Subgraph | Sentio_Subgraph | Goldsky_Subgraph |
| ---------------------- | ------ | --------------- | ---------------- | ------ | -------- | -------- | --------------- | ---------------- |
| case_1_lbtc_event_only | 8m     |                 | 3m               | 1h40m  | 10m      | 3h9m     | 2h36m           |                  |
| case_2_lbtc_full       | 6m     |                 | 1m               | 45m    | 34m      | 1h3m     | 56m             |                  |
| case_3_ethereum_block  | 18m    | 7.9s            |                  | 33m    | 1m‡      | 10m      | 15m             |                  |
| case_4_on_transaction  | 17m    | 1m26s           |                  | 33m    | 7m       | N/A      |                 |                  |
| case_5_on_trace        | 16m    | 41s             |                  | N/A§   | 2m       | 8m       | 1h21m           |                  |
| case_6_template        | 19m    |                 | 8s               | 21m    | 2m       | 19m      | 10m             | 20h24m           |

### Data Completeness

| Case | Sentio | Envio | Ponder | Subsquid | Subgraph |
|------|--------|-------|--------|----------|----------|
| case_1_lbtc_event_only | 296,734 | 296,734 | 296,138* | 296,734 | 296,734 |
| case_2_lbtc_full | 7,634 | 7,634 | 7,634 | 7,634 | 7,634 |
| case_3_ethereum_block | 100,001 | 100,001 | 100,001 | 100,001 | 100,001 |
| case_4_on_transaction | 1,696,641 | 1,696,423†† | 1,696,423 | 1,696,641 | N/A& |
| case_5_on_trace | 50,191 | 50,191 | 0** | 50,191 | 29,058§§ |
| case_6_template | 35,039 | 35,039 | 35,039 | 35,039 | 35,039 |

\* Missing ~5% of events
‡   Some implementations include 0x0000000000000000000000000000000000000000 address
††  Envio processes blocks 22,280,000 to 22,289,999 due to exclusive end block handling, resulting in 218 fewer transactions
&   Subgraph does not support transaction level access
**  Ponder documentation indicates trace support, but our implementation encountered configuration issues that prevented successful trace capture
§§  Subgraph captured only ~58% of swap traces due to architectural limitations in accessing internal transactions

### Key Observations

1. **Performance Comparison**:

   - Envio's HyperSync, a RPC alternative, technology shows exceptional performance across relevant test cases
   - Envio HyperIndex provides a full-featured indexing solution with competitive performance
   - Sentio performs consistently well across all test cases, showing strong performance
   - Ponder shows improved performance in case_2 (45m) compared to previous benchmarks
   - Subgraph demonstrates consistent performance with complete data coverage

2. **Data Completeness**:

   - All platforms achieved complete data coverage (7,634 records) in case_2 with perfect correlation in point calculations (Pearson: 0.9917-1.0000, Spearman: 0.9971-1.0000)
   - Ponder is missing approximately 5% of data in case_1
   - Envio/Ponder processes blocks up to but not including the end block in case_4 (stopping at 22,289,999) due to its exclusive end block handling
   - Sentio processed fewer traces in case_5 (45,895 vs 50,191 for Subsquid/Envio)
   - Subgraph captured only ~58% of swap transactions in case_5
   - Case 3 shows perfect data consistency with 100% similarity for blocks across all platforms

3. **Specialized Capabilities**:

   - Envio shows exceptional performance with HyperSync technology (7.9s for 100K blocks, 30.75s for 90K blocks with trace data)
   - Sentio performs consistently well across all test cases
   - Subsquid shows fast processing but significant data gaps in block-level indexing
   - Subgraph has fundamental architectural limitations for trace-level indexing, including inability to access internal transactions and inaccurate sender identification

4. **Resource Efficiency**:
   - Event processing (case_1) is efficient across all indexers
   - Block-level indexing (case_3) shows dramatic performance differences between traditional approaches and Envio's HyperSync
   - RPC calls and complex data handling (case_2) increase indexing time for all indexers
   - Trace processing (case_5) demonstrates the efficiency of specialized data access methods, with Envio's HyperSync showing exceptional performance
   - While Ponder officially supports trace-level indexing, our implementation encountered persistent issues with capturing trace data despite multiple configuration attempts

## Exported Data

All benchmark datasets, comparison reports, and analysis results are available via Google Drive:

- **Complete Dataset Collection**: [Indexer Benchmark Datasets](https://drive.google.com/drive/folders/1zwJsEoxQJSAKKPMlji4xRqnqR2nqVQ4k)
- Contains data from all benchmark cases for all tested indexer platforms
- Includes raw data, comparison reports, and analysis files for each benchmark scenario
- Individual case folders are also linked in their respective README files
  $$
