# Envio HyperSync Data Collection for Uniswap V2 Swaps

This module uses Envio's HyperSync API to efficiently collect Uniswap V2 swap data from Ethereum traces.

## Performance Metrics

Using Envio's HyperSync API, we achieved the following performance:

- **Total execution time**: 41 seconds
- **Blocks processed**: 90,000 (from block 22200000 to 22290000)
- **Traces processed**: 4,039,431
- **Swap records collected**: 50,191

This represents exceptional performance for trace-level data collection, demonstrating HyperSync's capabilities for efficiently retrieving and processing blockchain data.

## Prerequisites

- Node.js v16 or later
- npm or yarn

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

Copy the example environment file:

```bash
cp .env.example .env
```

The default configuration should work out of the box, but you can modify the `.env` file if you need to:

- `HYPERSYNC_URL`: URL of the HyperSync API (default: https://eth.hypersync.xyz)
- `HYPERSYNC_API_KEY`: Optional API key for HyperSync (if you have one)

## Usage

### Collecting Full Data

To collect the full dataset of Uniswap V2 swaps for the benchmark range:

```bash
node fetch-data.js
```

This will:
1. Query the HyperSync API for traces to the Uniswap V2 Router
2. Extract swap parameters from the trace input data
3. Get transaction-level senders for each swap
4. Save the data to `../data/envio-case5-swaps.parquet`

### Collecting Partial Data

For testing or faster runs, you can collect a partial dataset:

```bash
node fetch-data.js --partial
```

This will produce the same data but save it to `../data/envio-case5-swaps-partial.parquet`, and also copy it to the main output path for analysis.

## Data Schema

The collected data follows a standardized schema:

| Field          | Type   | Description                                |
|----------------|--------|--------------------------------------------|
| id             | string | Unique identifier (txHash-traceAddress)    |
| blockNumber    | int64  | Block number where the swap occurred       |
| transactionHash| string | Transaction hash                           |
| from           | string | EOA address that initiated the transaction |
| to             | string | Recipient address for the swap             |
| amountIn       | string | Input amount (string to preserve precision)|
| amountOutMin   | string | Minimum output amount expected             |
| deadline       | string | Transaction deadline timestamp             |
| path           | string | Comma-separated token addresses in path    |
| pathLength     | int32  | Number of tokens in the swap path          | 