# Case 3: Ethereum Block Indexing Benchmark

This benchmark tests the performance of various indexers when processing Ethereum blocks rather than specific events, creating an entity for each block with its metadata.

## Benchmark Specification

- **Target**: Ethereum blocks
- **Block Range**: 0 to 100000
- **Data Operations**: Block-level indexing
- **Handler Type**: Block handlers (not event handlers)
- **Block Data**: Block number, hash, timestamp, parent hash, etc.
- **Dataset**: [Google Drive](https://drive.google.com/drive/u/0/folders/1fqXsjO4CMkLJTxqOg2dKG8qPY8oM1x8E)

## Performance Results

| Indexer  | Processing Time | Records | Block Range | Coverage |
|----------|----------------|---------|-------------|----------|
| Sentio   | 18m            | 100001  | 0-100000    | Complete |
| Subsquid | 1m*            | 13156   | 0-100000    | Sparse (13.16%) |
| Envio HyperSync | 7.9s    | 100001  | 0-100000    | Complete |
| Ponder   | 33m            | 100001  | 0-100000    | Complete |
| Subgraph | 10m            | 100001  | 0-100000    | Complete |

\* *Subsquid used an archival node but has missing data, primarily indexing blocks in the 45000-100000 range*

## Block Distribution Details

- **Sentio**: Complete coverage of blocks 0-100000 (100001 blocks total)
- **Subsquid**: Highly sparse distribution:
  - 0-9999: Just 1 block (0.01% coverage) - only block 0
  - 10000-39999: No blocks at all (0% coverage)
  - 40000-49999: 1455 blocks (14.55% coverage)
  - 50000-59999: 2092 blocks (20.92% coverage) 
  - 60000-69999: 2322 blocks (23.22% coverage)
  - 70000-79999: 2296 blocks (22.96% coverage)
  - 80000-89999: 2770 blocks (27.70% coverage)
  - 90000-100000: 2220 blocks (22.20% coverage)
  - Largest gap: Block 0 to block 46147 (46146 missing blocks)
  - Overall, 86.84% of blocks in the range are missing
- **Envio HyperSync**: Complete coverage of blocks 0-100000 (100001 blocks total)
- **Ponder**: Complete coverage of blocks 0-100000 (100001 blocks total)
- **Subgraph**: Complete coverage of blocks 0-100000 (100001 blocks total)

## Similarity Analysis

We compared all platforms pairwise, focusing on three key fields:
- Block hash
- Parent hash
- Timestamp

### Similarity Table

| Platform Pair      | Common Blocks | Matching Blocks | Similarity (%) |
|--------------------|---------------|-----------------|----------------|
| Sentio vs Subsquid | 13155         | 13155           | 100.00%        |
| Sentio vs Envio    | 100001        | 100001          | 100.00%        |
| Sentio vs Ponder   | 100001        | 100001          | 100.00%        |
| Sentio vs Subgraph | 100001        | 100001          | 100.00%        |
| Subsquid vs Envio  | 13155         | 13155           | 100.00%        |
| Subsquid vs Ponder | 13156         | 13156           | 100.00%        |
| Subsquid vs Subgraph | 13156       | 13156           | 100.00%        |
| Envio vs Ponder    | 100001        | 100001          | 100.00%        |
| Envio vs Subgraph  | 100001        | 100001          | 100.00%        |
| Ponder vs Subgraph | 100001        | 100001          | 100.00%        |

## Key Findings

1. **Perfect Data Consistency**: All platforms show 100% similarity for the blocks they have in common. No differences were found in any of the key fields (hash, parentHash, timestamp) across any platform pair.

2. **Coverage Variations**:
   - **Complete Coverage**: Ponder and Subgraph have the most complete coverage with all 100,001 blocks (0-100,000, including genesis block).
   - **Near Complete**: Sentio (missing only block 0) and Envio (complete 0-99,999) have essentially complete coverage.
   - **Sparse Coverage**: Subsquid has significantly lower coverage with only 13,156 blocks, primarily in the 40,000-100,000 range.

3. **Performance Differences**:
   - **Envio** demonstrated the fastest processing with HyperSync (7.9 seconds), but does not support traditional block handlers
   - **Sentio**, **Ponder**, and **Subgraph** all completed indexing in reasonable timeframes (18-33 minutes)
   - **Subsquid** completed quickly (1 minute) but with significant data gaps

## Implementation Details

Each subdirectory contains the implementation for a specific indexing platform:
- `/sentio`: Sentio implementation 
- `/ponder`: Ponder implementation
- `/sqd`: Subsquid implementation
- `/subgraph`: The Graph subgraph implementation
- `/envio`: Envio implementation using HyperSync (not traditional block handlers)

## Platform Notes

### Sentio
- Complete coverage of blocks 1-100,000
- Completed in 18 minutes

### Subsquid
- Sparse coverage (13.16%) with significant gaps, primarily indexing blocks in 45,000-100,000 range
- Uses archival node but still has missing data
- Total of 9,071 gaps identified with the largest being 46,146 consecutive missing blocks
- Database connection: `PGPASSWORD="hcGgm1BIXTjbZ-lhkKeZ8vfBFQ3Xmkka" psql -h pg.squid.subsquid.io -d 16307_lf5mma -U 16307_lf5mma`

### Envio HyperSync
- Does not support traditional block handlers, but achieved complete coverage using HyperSync
- Fastest processing time at 7.9 seconds for 100,000 blocks
- Processes approximately 12,658 blocks per second

### Ponder
- Complete coverage of blocks 0-100,000
- Completed in 33 minutes
- Used PGlite database

### Subgraph
- Complete coverage of blocks 0-100,000
- Completed in 10 minutes

## Conclusion

The analysis reveals exceptional consistency in Ethereum block data across all five indexing platforms. Despite the differences in coverage, where blocks are present in multiple platforms, the data shows 100% consistency across all examined fields.

This benchmark highlights significant differences in processing approaches across platforms, with Envio's HyperSync demonstrating exceptional speed but through a different approach than traditional block-by-block indexing. Sentio, Ponder, and Subgraph all performed reliably with complete data, while Subsquid showed gaps in its coverage despite fast processing.

## Access Information

### Exported Data
All the block data collected from each platform has been exported and is available via Google Drive:
- **Google Drive Folder**: [Case 3 - Ethereum Block Data](https://drive.google.com/drive/u/0/folders/1fqXsjO4CMkLJTxqOg2dKG8qPY8oM1x8E)
- Contains Parquet files with block data from all platforms
- Includes comparison reports and visualization data

### Sentio
- **Dashboard URL**: https://app.sentio.xyz/yufei/case_3_ethereum_block/data-explorer/sql
- **API Access**: 
  ```
  READ_ONLY KEY: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl
  curl -L -X POST 'https://app.sentio.xyz/api/v1/analytics/yufei/case_3_ethereum_block/sql/execute' \
     -H 'Content-Type: application/json' \
     -H 'api-key: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl' \
     --data-raw '{
       "sqlQuery": {
         "sql": "YOUR_QUERY_HERE"
       }
     }'
  ```
- **Data Summary**: Contains multiple tables including autogen_ tables with block data
