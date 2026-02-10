# Transaction Gas Monitor

This module provides a high-performance transaction gas usage monitor using HyperSync, designed for the Case 4 benchmark (on-transaction processing).

## Overview

The transaction gas monitor extracts transaction data from Ethereum, focusing specifically on calculating and tracking gas costs for each transaction. It processes transactions directly from blockchain data and saves the results for analysis.

## Features

- High-performance transaction data extraction using HyperSync
- Gas cost calculation (gasUsed * gasPrice)
- Processes large block ranges quickly
- Configurable block range and batch size
- Detailed performance metrics

## Installation & Setup

1. Make sure you have Node.js and npm installed
2. Install the required dependencies:

```bash
npm install
```

3. Make sure the `TransactionMonitor.ts` file is in the `src` directory
4. Ensure the `run-gas-monitor.sh` script is executable:

```bash
chmod +x run-gas-monitor.sh
```

## Quick Start

The simplest way to run the gas monitor is using the provided shell script:

```bash
./run-gas-monitor.sh
```

This will:
1. Install necessary dependencies
2. Execute the gas monitor script
3. Extract transaction data from blocks 22200000 to 22230000
4. Save the results to `transaction-gas-data.json`

## Implementation Details

The main implementation is in `src/TransactionMonitor.ts` which provides a reusable `TransactionGasMonitor` class. This class:

1. Connects to the HyperSync API to query transaction data
2. Efficiently streams data for processing
3. Calculates gas costs for each transaction
4. Formats and returns the extracted gas data

## Data Structure

Each gas record contains:

```typescript
{
  id: string;           // Transaction hash
  from: string;         // Sender address
  to: string;           // Recipient address
  gasValue: string;     // Gas cost (gasUsed * gasPrice)
  blockNumber: number;  // Block where transaction was executed
  timestamp: number;    // Block timestamp
}
```

## Usage in Your Code

```typescript
import { HypersyncClient } from '@envio-dev/hypersync-client';
import { TransactionGasMonitor } from './src/TransactionMonitor';

async function main() {
  // Initialize HyperSync client
  const hyperSync = await HypersyncClient.new({
    url: 'https://eth.hypersync.xyz',
    bearerToken: 'free', // Use your API key for production
  });

  // Create monitor with custom configuration
  const monitor = new TransactionGasMonitor({
    startBlock: 22200000,
    endBlock: 22230000, 
    batchSize: 100
  });

  // Extract gas data
  const records = await monitor.extractTransactions(hyperSync);
  
  // Use the records
  console.log(`Extracted ${records.length} gas records`);
}
```

## Performance

The gas monitor is designed for high performance and should process thousands of transactions per second, making it suitable for large-scale data extraction and analysis.

## Comparison with Other Implementations

This implementation mirrors the functionality from the Case 4 benchmark, which tracks transaction gas usage across various indexer frameworks. The HyperSync approach offers several advantages:

1. **Direct data access**: Uses HyperSync to efficiently retrieve only the needed transaction fields
2. **Optimized processing**: Streams data in batches for better memory usage
3. **Minimal dependencies**: Uses a lightweight approach with few external dependencies

## Troubleshooting

### Missing or Undefined Transaction Fields

If you encounter issues with missing transaction fields:
- Check that you've included all required fields in the query's `fieldSelection`
- Verify the block range you're querying has the expected transactions
- Monitor the log output for the first response structure which shows what fields are available

### API Connection Issues

If you have trouble connecting to the HyperSync API:
- Ensure you're using the correct API URL
- Check your API token if you're using an authenticated endpoint
- For free tier usage, the `bearerToken: 'free'` configuration should work

## Dependencies

- `@envio-dev/hypersync-client`: For accessing the HyperSync API
- `bignumber.js`: For precise gas cost calculations

## Additional Notes

- For production use, consider using a dedicated API key from the HyperSync team
- The configuration allows adjusting the block range and batch size to optimize for your specific use case 