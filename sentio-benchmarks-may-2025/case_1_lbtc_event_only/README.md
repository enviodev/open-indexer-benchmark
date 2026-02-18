# Case 1: LBTC Event-Only Indexing Benchmark

This benchmark tests the performance of various indexers when processing simple Transfer events from the LBTC token contract.

## Benchmark Specification

- **Target Contract**: LBTC Token (0x8236a87084f8B84306f72007F36F2618A5634494)
- **Events Indexed**: Transfer events only
- **Block Range**: 0 to 22200000
- **Data Operations**: Write-only operations
- **RPC Calls**: None (data derived directly from event logs)
- **Dataset**: [Google Drive](https://drive.google.com/drive/u/0/folders/1D8HXn7U7qQjzaEh1TLUZbNzVW_6nIRpT)

## Implementation Details

The benchmark requires each indexer to:

1. Listen for `Transfer(address indexed from, address indexed to, uint256 value)` events
2. Create a record for each Transfer event with the following fields:
   - ID (unique identifier)
   - From address
   - To address
   - Value transferred
   - Block number
   - Transaction hash

## Performance Results

| Indexer          | Time to Complete | Records Indexed | Notes                   |
| ---------------- | ---------------- | --------------- | ----------------------- |
| Sentio           | 8m               | 296,734         |                         |
| Envio HyperIndex | 3m               | 296,734         | Fastest processing time |
| Ponder           | 1h40m            | 296,138         | Missing ~5% of events   |
| Subsquid         | 10m              | 296,734         |                         |
| Subgraph         | 3h9m             | 296,734         |                         |

## Implementation Examples

Each subdirectory contains the implementation for a specific indexing platform:

- `/sentio`: Sentio implementation
- `/envio`: Envio implementation
- `/ponder`: Ponder implementation
- `/sqd`: Subsquid implementation
- `/subgraph`: The Graph subgraph implementation

## Running the Benchmark

Each implementation includes its own setup and execution instructions. Generally, you will need to:

1. Install the required dependencies
2. Configure RPC endpoints
3. Start the indexer
4. Monitor progress
5. Record completion time

## Key Observations

- Envio HyperIndex demonstrates the fastest processing time for this simple event indexing scenario
- Ponder processes events significantly slower and misses approximately 5% of the data
- Sentio and Subsquid offer good balance of speed and completeness
- Subgraph requires significantly more time to complete the indexing

This benchmark showcases performance differences when handling straightforward event-only indexing, which is a common use case for blockchain data indexing.

## Access Information

### Exported Data

All the transfer event data collected from each platform has been exported and is available via Google Drive:

- **Google Drive Folder**: [Case 1 - LBTC Event-Only Data](https://drive.google.com/drive/u/0/folders/1D8HXn7U7qQjzaEh1TLUZbNzVW_6nIRpT)
- Contains datasets with transfer events from all platforms
- Includes comparative analysis and benchmark results

### Sentio

- **Dashboard URL**: https://app.sentio.xyz/yufei/case_1_lbtc_event_only/data-explorer/sql
- **API Access**:
  ```
  READ_ONLY KEY: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl
  curl -L -X POST 'https://app.sentio.xyz/api/v1/analytics/yufei/case_1_lbtc_event_only/sql/execute' \
     -H 'Content-Type: application/json' \
     -H 'api-key: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl' \
     --data-raw '{
       "sqlQuery": {
         "sql": "YOUR_QUERY_HERE"
       }
     }'
  ```
- **Data Summary**: 296,734 records in the transfers collection
- **Block Range**: 0 to 22200000

### Envio

- **Dashboard URL**: https://envio.dev/app/0xdatapunk/case_1_lbtc_event_only
- **GraphQL Endpoint**: https://indexer.dev.hyperindex.xyz/6c63ec1/v1/graphql
- **Data Summary**:
  - Block Range: 0 to 22200000
  - Total Records: 296,734

### Sentio Subgraph

- **Dashboard URL**: https://app.sentio.xyz/yufei/case_1_lbtc_event_only_subgraph/data-explorer/sql
- **API Access**:
  ```
  READ_ONLY KEY: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl
  curl -L -X POST 'https://app.sentio.xyz/api/v1/analytics/yufei/case_1_lbtc_event_only_subgraph/sql/execute' \
     -H 'Content-Type: application/json' \
     -H 'api-key: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl' \
     --data-raw '{
       "sqlQuery": {
         "sql": "YOUR_QUERY_HERE"
       }
     }'
  ```
