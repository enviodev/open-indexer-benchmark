# Ponder Implementation for Gas Usage Indexing (Case 4)

This directory contains a Ponder implementation for indexing Ethereum transaction gas usage (Case 4 benchmark).

## Performance Summary

- **Total Records Processed**: 1,696,423 gas transaction records
- **Blocks Processed**: 10,000 blocks (from block 22,280,000 to 22,290,000)
- **Total Runtime**: 33 minutes (end-to-end processing)
- **Average Processing Time per Block Event**: 33.057ms (core event handling only)
- **Average Transactions per Block**: ~170 transactions

## Implementation Details

The implementation focuses on efficiently processing Ethereum transactions to extract and store gas usage data:

1. **Data Source**: Ethereum mainnet blocks 22,280,000 to 22,290,000
2. **Indexing Strategy**: Process every block, extract all transactions, and calculate gas values
3. **Database Schema**: Simple schema with fields for transaction details and gas metrics
4. **Batch Processing**: Optimized to process and insert transaction data in batches for improved performance

## Key Files

- `src/index.ts`: Main indexing logic that processes blocks and transactions
- `ponder.schema.ts`: Database schema definition for gas transaction records
- `ponder.config.ts`: Configuration file specifying blockchain and indexing parameters
- `test-script.sh`: Script for running and benchmarking the indexer

## Running the Benchmark

To run the benchmark:

1. Install dependencies:
   ```
   npm install
   ```

2. Set environment variables in `.env.local`:
   ```
   PONDER_RPC_URL_1=https://your-ethereum-rpc-endpoint
   ```

3. Run the test script:
   ```
   chmod +x test-script.sh
   ./test-script.sh
   ```

## Query Examples

After indexing completes, you can query the data using GraphQL at `http://localhost:42069/graphql`:

```graphql
{
  gasSpents(limit: 10) {
    items {
      id
      blockNumber
      transactionHash
      from
      to
      gasValue
    }
  }
}
```

Or use SQL through the PostgreSQL database:

```sql
SELECT COUNT(*) FROM "gasSpent";
``` 