# Sentio Implementation - Ethereum Block Benchmark

This directory contains a Sentio processor implementation for indexing Ethereum blocks, creating entities for each block with its metadata.

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

- `src/` - Contains the processor source code with block handlers
- `abis/` - Contains any required ABI files
- `sentio.yaml` - Configuration file for the Sentio project
- `package.json` - Node.js project configuration

## Implementation Details

This processor implementation:
1. Uses block handlers to process Ethereum blocks from 0 to 10,000,000
2. Extracts block metadata (number, hash, timestamp, parent hash, etc.)
3. Creates block entities with the extracted data
4. Demonstrates efficient block-level indexing

## Performance Results

In the benchmark test, this Sentio processor completed indexing of 10 million Ethereum blocks in just **4 minutes**, making it significantly faster than all other implementations for this block-level indexing scenario.

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

### Specify Block Range for Processing

To modify the block range for processing:

```bash
# Edit sentio.yaml to add start and end blocks
# Then update the configuration
yarn sentio update
```

For more details on Sentio processor development, refer to the [official documentation](https://docs.sentio.xyz/docs/quickstart).
