# Case 6: Uniswap V2 Template Benchmark

This benchmark tests the performance of various indexers when processing Uniswap V2 factory events and tracking pair creation.

## Benchmark Specification

- **Target Data**: Uniswap V2 factory events and pair creation tracking
- **Data Processed**: Factory events and pair data
- **Block Range**: 19000000 to 19010000 (10000 blocks)
- **Data Operations**: Event handling and pair analysis
- **RPC Calls**: Required for pair data retrieval
- **Dataset**: [Google Drive](https://drive.google.com/drive/folders/1407EeP-KzUwzujdnkoP_DiewJNbOHqcY)

## Performance Results

| Indexer          | Processing Time | Records | Block Range       |
| ---------------- | --------------- | ------- | ----------------- |
| Envio HyperIndex | 8s              | 35,039  | 19000000-19010000 |
| Subsquid         | 2m              | 33,972  | 19000000-19010000 |
| Sentio           | 19m             | 35,039  | 19000000-19010000 |
| Subgraph         | 19m             | 35,039  | 19000000-19010000 |
| Ponder           | 21m             | 35,039  | 19000000-19010000 |

## Data Distribution Details

The distribution of factory events and pairs across platforms shows some variations in data completeness:

- **Sentio**: 35,039 records
  - Complete coverage of all factory events
  - Accurate pair tracking
- **Subsquid**: 33,972 records
  - Missing 1,067 pairs compared to other platforms
  - Limited by template configuration constraints
- **Envio HyperIndex**: 35,039 records
  - Complete coverage of all factory events
  - Accurate pair tracking
- **Ponder**: 35,039 records
  - Complete coverage of all factory events
  - Accurate pair tracking
- **Subgraph**: 35,039 records
  - Complete coverage of all factory events
  - Accurate pair tracking

## Key Findings

1. **Data Completeness**:

   - **Complete Coverage**: Sentio, Envio HyperIndex, Ponder, and Subgraph all captured 35,039 records
   - **Partial Coverage**: Subsquid captured 33,972 records (~97% of total)
   - The difference in Subsquid's record count is due to template configuration limitations

2. **Performance Differences**:

   - **Envio HyperIndex** demonstrated exceptional performance at 30 seconds
   - **Subsquid** showed excellent performance at 2 minutes
   - **Sentio** and **Subgraph** completed in 19 minutes
   - **Ponder** processed in 21 minutes

3. **Implementation Approaches**:
   - Envio HyperIndex's implementation leverages their optimized template processing
   - Traditional indexers process factory events through event handlers
   - Subsquid requires manual configuration updates for template optimization

## Implementation Details

Each subdirectory contains the implementation for a specific indexing platform:

- `/sentio`: Sentio implementation
- `/envio`: Envio HyperIndex implementation
- `/ponder`: Ponder implementation
- `/sqd`: Subsquid implementation
- `/subgraph`: Subgraph implementation

## Platform Notes

### Sentio

- Complete coverage of all factory events
- Processing time: 19 minutes
- Total records: 35,039
- Accurate pair tracking and analysis

### Subsquid

- Partial coverage with 33,972 records
- Processing time: 2 minutes
- Limited by template configuration constraints
- Requires manual updates for optimal performance

### Envio HyperIndex

- Uses optimized template processing
- Processing time: 8 seconds
- Total records: 35,039
- Complete and accurate pair tracking

### Ponder

- Complete coverage of all factory events
- Processing time: 21 minutes
- Total records: 35,039
- Accurate pair tracking

### Subgraph

- Complete coverage of all factory events
- Processing time: 19 minutes
- Total records: 35,039
- Accurate pair tracking

## Conclusion

This benchmark reveals significant differences in template processing capabilities across indexing platforms. Envio HyperIndex demonstrates exceptional speed, while Subsquid shows fast processing but with some data completeness limitations. All other platforms show complete data coverage but with varying processing times.

These results emphasize the importance of choosing the right indexing solution based on specific use cases, especially for applications requiring factory event processing and pair tracking such as DEX monitoring, liquidity analysis, or pair creation tracking.

## Access Information

### Exported Data

All the factory event data collected from each platform has been exported and is available via Google Drive:

- **Google Drive Folder**: [Case 6 - Uniswap V2 Template Data](https://drive.google.com/drive/folders/1407EeP-KzUwzujdnkoP_DiewJNbOHqcY)
- Contains datasets with factory event data from all platforms
- Includes comparative analysis and benchmark results

### Sentio

- **Dashboard URL**: https://app.sentio.xyz/yufei/case_6_template/data-explorer/sql
- **Data Summary**: 35,039 records with complete coverage
