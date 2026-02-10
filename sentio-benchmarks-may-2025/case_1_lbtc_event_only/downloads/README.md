# Case 1: LBTC Event Data Collection and Analysis

This directory contains scripts for fetching and analyzing LBTC transfer event data from various indexing platforms.

## Block Range

All data is collected for the block range `22280000-22281000` (1,000 blocks).

## Scripts Overview

- `fetch-all-data.js`: Collects data from all indexing platforms (Sentio, Envio, Ponder, Subsquid, Subgraph)
- `fetch-sentio-only.js`: Specialized script for fetching only Sentio data, with batch processing and fallback mechanisms
- `generate-comparison.js`: Analyzes data across platforms and generates a comparison report
- `generate-report.js`: Creates an HTML visualization of the comparison results

## Latest Results

The latest analysis was conducted on April 16, 2025:

### Data Load Status
- **Sentio**: 1,000 records (sample data)
- **Envio**: 1,000 records (sample data)
- **Ponder**: No data available
- **Subsquid**: No data available
- **Subgraph**: No records found

### Block Range Analysis
- **Sentio**: No block data detected in the sample records
- **Envio**: Blocks 22280001 to 22280999 (sample data)
- **Subgraph**: No data available

### Data Consistency Analysis
- **Jaccard Similarity**: 0% across all platforms
  - This is expected as we're comparing generated sample data with random values

## Running the Scripts

1. Fetch data from Sentio:
   ```
   node fetch-sentio-only.js
   ```

2. Fetch data from all platforms:
   ```
   node fetch-all-data.js
   ```

3. Generate comparison report:
   ```
   node generate-comparison.js
   ```

4. Create HTML visualization:
   ```
   node generate-report.js
   ```

The HTML report will be available at `comparison-report.html`.

## Notes

- Sample data is generated when actual data cannot be retrieved from the API
- For more accurate analysis, ensure the actual APIs are accessible
- The current analysis uses sample data, explaining the 0% similarity between platforms 