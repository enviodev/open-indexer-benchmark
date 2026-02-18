# Case 5: Uniswap V2 Transaction Trace Analysis Benchmark

This benchmark tests the performance of various indexers when processing Uniswap V2 swap transaction traces from Ethereum transactions.

## Benchmark Specification

- **Target Data**: Uniswap V2 swap transactions and their traces
- **Data Processed**: Transaction traces with swap decoding
- **Block Range**: 22200000 to 22290000 (90,000 blocks)
- **Data Operations**: Transaction trace processing with swap analysis
- **RPC Calls**: Required for trace data retrieval
- **Dataset**: [Google Drive](https://drive.google.com/drive/folders/1407EeP-KzUwzujdnkoP_DiewJNbOHqcY)

## Performance Results

| Indexer    | Processing Time | Records | Block Range |
|------------|----------------|---------|-------------|
| Envio HyperSync     | 41s            | 50,191  | 22,200,000-22,290,000 |
| Subsquid   | 2m             | 50,191  | 22,200,000-22,290,000 |
| Sentio     | 16m            | 50,191  | 22,200,000-22,290,000 |
| Subgraph   | 8m             | 29,058  | 22,200,000-22,290,000 |
| Ponder     | N/A            | 0       | 22,200,000-22,290,000 |

## Data Distribution Details

The distribution of swap transactions across platforms shows significant variations in data completeness:

- **Sentio**: 50,191 swap records
  - Unique senders: 1,238
  - Unique recipients: 1,343
  - Average path length: 2.07
  - Unique tokens: 1,463
- **Subsquid**: 50,191 swap records
  - Unique senders: 1,238
  - Unique recipients: 1,343
  - Average path length: 2.07
  - Unique tokens: 1,463
- **Envio**: 50,191 swap records
  - Unique senders: 1,238
  - Unique recipients: 1,343
  - Average path length: 2.07
  - Unique tokens: 1,463
- **Ponder**: 0 records (implementation issues)
- **Subgraph**: 29,058 swap records
  - Unique senders: 1,147
  - Unique recipients: 1,272
  - Average path length: 2.09
  - Unique tokens: 1,335

## Key Findings

1. **Data Completeness**:
   - **Complete Coverage**: Sentio, Subsquid, and Envio all captured 50,191 swap records with identical data distribution
   - **Partial Coverage**: Subgraph captured only 29,058 records (~58% of total)
   - **No Coverage**: Ponder implementation encountered issues with trace capture

2. **Performance Differences**:
   - **Envio with HyperSync** demonstrated exceptional performance at 41 seconds
   - **Subsquid** showed excellent performance at 2 minutes
   - **Sentio** completed in 16 minutes with reliable performance
   - **Subgraph** processed in 8 minutes but with incomplete data
   - **Ponder** failed to capture any trace data

3. **Implementation Approaches**:
   - Envio's implementation leverages their HyperSync technology for optimized trace data access
   - Traditional indexers process traces through transaction handlers with RPC calls
   - Subgraph's architectural limitations prevent complete trace capture

## Implementation Details

Each subdirectory contains the implementation for a specific indexing platform:
- `/sentio`: Sentio implementation 
- `/envio`: Envio implementation with HyperSync
- `/ponder`: Ponder implementation
- `/sqd`: Subsquid implementation
- `/subgraph`: Subgraph implementation

## Platform Notes

### Sentio
- Complete coverage of all swap transactions
- Processing time: 16 minutes
- Total swap records: 50,191
- Identifies 1,238 unique senders and 1,343 unique recipients
- Captures 1,463 unique tokens in swap paths

### Subsquid
- Complete coverage of all swap transactions
- Processing time: 2 minutes
- Total swap records: 50,191
- Matches Sentio's data distribution exactly

### Envio
- Uses HyperSync technology for optimized trace data access
- Processing time: 41 seconds
- Total swap records: 50,191
- Identical data distribution to Sentio and Subsquid

### Ponder
- Failed to capture any trace data
- Implementation encountered configuration issues
- Documentation indicates trace support, but practical implementation proved challenging

### Subgraph
- Partial coverage with 29,058 records (~58% of total)
- Processing time: 8 minutes
- Captures fewer unique senders (1,147 vs 1,238) and recipients (1,272 vs 1,343)
- Limited internal transaction visibility affects data completeness

## Conclusion

This benchmark reveals significant differences in trace processing capabilities across indexing platforms. Envio's HyperSync technology demonstrates exceptional speed, while Sentio and Subsquid show complete and accurate data capture. Subgraph's architectural limitations result in incomplete data, and Ponder's implementation challenges highlight the complexity of trace-level indexing.

These results emphasize the importance of choosing the right indexing solution based on specific use cases, especially for applications requiring detailed transaction trace analysis such as DEX monitoring, swap analysis, or complex transaction flow tracking.

## Access Information

### Exported Data
All the swap transaction data collected from each platform has been exported and is available via Google Drive:
- **Google Drive Folder**: [Case 5 - Uniswap V2 Trace Analysis Data](https://drive.google.com/drive/folders/1407EeP-KzUwzujdnkoP_DiewJNbOHqcY)
- Contains datasets with swap transaction data from all platforms
- Includes comparative analysis and benchmark results

### Sentio
- **Dashboard URL**: https://app.sentio.xyz/yufei/case_5_on_trace/data-explorer/sql
- **Data Summary**: 50,191 swap records with complete coverage
- **Key Metrics**:
  - 1,238 unique senders
  - 1,343 unique recipients
  - 1,463 unique tokens
  - Average path length: 2.07
