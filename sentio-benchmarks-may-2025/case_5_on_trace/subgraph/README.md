# Uniswap V2 Trace Subgraph

This subgraph indexes calls to the Uniswap V2 Router, specifically capturing `swapExactTokensForTokens` function calls and storing detailed information about the swaps.

## Overview

The approach used in this subgraph is to monitor direct function calls to the Uniswap V2 Router. While this provides valuable data about swap activity, it's important to understand the architectural limitations of subgraphs when it comes to trace-level indexing.

## Features

- Monitors direct function calls to Uniswap V2 Router
- Decodes `swapExactTokensForTokens` function calls
- Extracts detailed swap information:
  - Input/output tokens
  - Amounts
  - Sender and recipient
  - Transaction metadata

## Technical Architecture

### Entities

1. **Swap**
   - Stores information about each swap transaction
   - Includes transaction details, token addresses, amounts, timestamps

### Call Processing

The subgraph uses call handlers to process function calls:

1. Identifies direct calls to the Uniswap V2 Router
2. Decodes function parameters to extract swap details
3. Creates entities in the database

## Important Limitations

Unlike trace-based indexers, subgraphs have fundamental limitations when it comes to capturing complete trace data:

1. **Limited to Direct Contract Calls**: Subgraphs can only monitor direct calls to the contracts they track. They cannot access internal transactions or calls made through intermediaries.

2. **Missing Internal Transactions**: Approximately 40% of swap transactions occur as internal transactions (calls made from one contract to another), which are invisible to subgraphs.

3. **Incorrect Sender Addresses**: The `call.from` field in subgraph call handlers returns the immediate contract caller, not the original EOA (Externally Owned Account) that initiated the transaction. This results in:
   - Only ~427 unique senders captured (vs. ~1,200 in trace-based indexers)
   - Contract addresses often being recorded as senders instead of actual user wallets
   - Inaccurate sender analytics

4. **No traceAddress Access**: Subgraphs have no direct access to the traceAddress of a function call, making it difficult to disambiguate multiple identical calls within a single transaction.

5. **Function Variants**: Multiple function signature variants (e.g., `swapExactTokensForTokensSupportingFeeOnTransferTokens`) must be manually added, but even then, internal calls are missed.

### Comparison with Trace-Based Indexers

| Aspect | Subgraph | Trace-Based Indexers |
|--------|----------|----------------------|
| Records Captured | ~29,000 | ~50,000 |
| Unique Senders | ~427 | ~1,200 |
| Internal Transactions | Not visible | Fully accessible |
| Sender Accuracy | Often returns contracts | Accurate EOA addresses |
| Implementation | Easier, GraphQL support | More complex, better data |

## Installation & Setup

1. Install the Graph CLI:
```bash
npm install -g @graphprotocol/graph-cli
```

2. Install dependencies:
```bash
npm install
```

3. Generate AssemblyScript types:
```bash
npm run codegen
```

4. Build the subgraph:
```bash
npm run build
```

## Deployment

### Local Deployment

```bash
# Start a local Graph Node
docker-compose up

# Create and deploy the subgraph locally
npm run create-local
npm run deploy-local
```

### Hosted Service Deployment

```bash
# Deploy to the Graph's hosted service (requires authentication)
npm run deploy
```

## Implementation Notes

### Improving Function Call Capture

To maximize the capture of direct function calls, you can add additional function signatures to the manifest:

```yaml
callHandlers:
  - function: swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    handler: handleSwapExactTokensForTokens
  - function: swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)
    handler: handleSwapExactTokensForTokens
  # Add other variants
```

However, this will still miss internal transactions and have incorrect sender addresses.

### Sender Address Correction

To get the correct transaction sender (EOA) in your handler, use `call.transaction.from` instead of `call.from`:

```typescript
// INCORRECT - Gets the immediate contract caller
swap.from = call.from.toHexString().toLowerCase();

// CORRECT - Gets the actual user wallet that initiated the transaction
swap.from = call.transaction.from.toHexString().toLowerCase();
```

## Recommended Use Cases

Given the limitations, subgraphs are well-suited for:
- Basic monitoring of direct contract interactions
- Simple analytics not requiring complete trace data
- Use cases where sender identity is not critical

For comprehensive trace analysis, consider using trace-based indexers like Subsquid, Sentio, or Envio.

## Query Examples

Query for recent swaps:

```graphql
{
  swaps(first: 10, orderBy: blockNumber, orderDirection: desc) {
    id
    transactionHash
    from
    to
    amountIn
    amountOutMin
    path
    blockNumber
  }
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 