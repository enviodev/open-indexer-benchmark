# Sentio Implementation for Case 5: On-Trace

This is a Sentio implementation for tracing `swapExactTokensForTokens` function calls to the Uniswap V2 Router on Ethereum.

## Overview

This processor tracks function call traces to the Uniswap V2 Router contract on Ethereum, capturing swap parameters and storing them for analysis.

## Prerequisites

- Node.js (v16 or later)
- npm or yarn

## Setup

1. Install dependencies:
```bash
npm run install-deps
```

2. Fetch trace data:
```bash
npm run fetch-traces
```

## Implementation Details

The implementation focuses on processing swap traces from the Uniswap V2 Router contract. It:

1. Connects to HyperSync API to fetch traces for the Uniswap V2 Router
2. Identifies traces that call the `swapExactTokensForTokens` function
3. Decodes the input data to extract swap parameters:
   - Token in/out addresses
   - Input amount and minimum output amount
   - Recipient addresses
4. Records all swap details
5. Saves the data in both JSON and Parquet formats for analysis

## Key Features

- **High Performance**: The implementation processes 10,000 blocks in just a few seconds.
- **Accurate Data Extraction**: Uses precise decoding of trace input data to extract swap parameters.
- **Comprehensive Data**: Captures all relevant swap parameters including token addresses, amounts, and transaction metadata.
- **Efficient Storage**: Utilizes Parquet format for efficient data storage and retrieval.

## Data Schema

The swap data schema includes:
- `traceHash`: Unique identifier for the trace
- `txHash`: Transaction hash
- `blockNumber`: Block number
- `tokenIn`: Input token contract address
- `tokenOut`: Output token contract address
- `amountIn`: Input amount
- `amountOutMin`: Minimum output amount
- `to`: Recipient address
- `timestamp`: Block timestamp

## Configuration

The processor is configured to target:
- Chain: Ethereum (1)
- Contract: Uniswap V2 Router (`0x7a250d5630b4cf539739df2c5dacb4c659f2488d`)
- Block Range: 22280000 to 22290000

## Output

The data is saved to:
- `../data/sentio-case5-swap-data.json` (JSON format)
- `../data/sentio-case5-swap-data.parquet` (Parquet format)

## HyperSync Configuration

The implementation uses the HyperSync client to query Ethereum traces with the following parameters:
- Target contract: Uniswap V2 Router
- Method signature: `0x38ed1739` (swapExactTokensForTokens)
- Call type: CALL
- Fields: Transaction hash, block number, from/to addresses, input data, gas metrics

## Future Extensions

This implementation can be extended to:
1. Index additional swap functions (e.g., swapTokensForExactTokens)
2. Track liquidity addition/removal
3. Calculate price impacts and slippage
4. Analyze gas usage patterns
