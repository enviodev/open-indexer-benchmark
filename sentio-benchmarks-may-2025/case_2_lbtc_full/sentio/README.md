# Sentio Implementation - LBTC Full Benchmark

This directory contains a Sentio processor implementation for the LBTC token full benchmark case, which includes processing transfer events and making RPC calls to fetch token balances.

## Prerequisites

* **Node.js:** Version 22 or later recommended
* **Sentio Account:** Sign up at [app.sentio.xyz](https://app.sentio.xyz)

## Setup & Running Instructions

### 1. Login to Sentio

```bash
npx @sentio/cli@latest login
```

### 2. Install Dependencies

```bash
yarn install
```

### 3. Build the Processor

```bash
yarn sentio build
```

### 4. Upload the Processor

```bash
yarn sentio upload
```

### 5. Monitor & Verify

Once uploaded, you can monitor the processor's progress on the [Sentio Dashboard](https://app.sentio.xyz):

1. Navigate to your project
2. Check the "Data Sources" section to see processor status
3. View "Analytics" or "Metrics" to see the indexed data
4. Check "Logs" or "Events" for detailed processing information

## Project Structure

- `src/` - Contains the processor source code
- `abis/` - Contains ABI files for the LBTC contract
- `sentio.yaml` - Configuration file for the Sentio project
- `package.json` - Node.js project configuration

## Implementation Details

This processor implementation:
1. Processes Transfer events from the LBTC token contract
2. Makes RPC calls to fetch current balances using contract.balanceOf()
3. Creates and updates account records
4. Maintains balance snapshots

## Performance Results

In the benchmark test, this Sentio processor completed indexing with RPC calls in **27 minutes**, making it the fastest implementation for this complex use case.

## Additional Commands

### Start Local Development Server

```bash
yarn sentio dev
```

### View Logs During Processing

```bash
yarn sentio logs
```

### Update Processor Configuration

```bash
yarn sentio update
```

For more details on Sentio processor development, refer to the [official documentation](https://docs.sentio.xyz/docs/quickstart). 