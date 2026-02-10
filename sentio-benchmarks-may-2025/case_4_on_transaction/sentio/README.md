
# Sentio Implementation - LBTC Event Only Benchmark

This directory contains a Sentio processor implementation for the LBTC token transfer events benchmark case.

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

## Query Examples

To count all processed transfer events:

```sql
select count(*) from `Transfer` limit 4
```

## Performance Results

In the benchmark test, this Sentio processor completed indexing of all LBTC transfer events in **6 minutes**.

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
