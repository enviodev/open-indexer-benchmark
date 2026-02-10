# Ponder Implementation - Ethereum Block Benchmark

This directory contains a Ponder implementation for indexing Ethereum blocks, demonstrating Ponder's ability to process block-level data.

## Prerequisites

* **Node.js:** v18 or later
* **Package Manager:** npm, yarn, or pnpm
* **Database:** PostgreSQL (automatically provisioned during development)

## Setup & Running Instructions

### 1. Install Dependencies

```bash
pnpm install
```
Or use npm/yarn if preferred:
```bash
npm install
# or
yarn install
```

### 2. Configure Environment

Ensure your `.env.local` file contains the proper RPC URL:

```
PONDER_RPC_URL_1="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
```

### 3. Start the Development Server

```bash
pnpm dev
```
This will:
- Start the local development server
- Begin indexing block data from the blockchain
- Automatically reload on file changes
- Display logs and errors in the console

### 4. Access the GraphQL API

Once running, you can access the GraphQL playground at:
```
http://localhost:42069/graphql
```

### 5. Production Deployment

To build for production:
```bash
pnpm build
```

To start the production server:
```bash
pnpm start
```

## Project Structure

- `src/` - Contains indexing functions with block handlers
- `ponder.config.ts` - Configuration for networks and block range
- `ponder.schema.ts` - Schema definition for block entities
- `.env.local` - Environment variables including RPC URLs

## Implementation Details

This implementation:
1. Uses block handlers to process Ethereum blocks from 0 to 10,000,000
2. Extracts block metadata (number, hash, timestamp, parent hash, etc.)
3. Creates block entities with the extracted data
4. Demonstrates Ponder's ability to handle block-level indexing

## Database Access

Connect to the PostgreSQL database:

```bash
PGPASSWORD="LhYOfYxqnQbQAXQJrKdznIkDDTmsZHGC" psql -h yamabiko.proxy.rlwy.net -p 34027 -U postgres -d railway
```

Set the search path:
```sql
SET search_path TO "fb1dbd8f-487b-4ffe-be34-e440181efa32";
```

Example queries:
```sql
-- Count total blocks
SELECT COUNT(*) FROM block;

-- Check the highest indexed block
SELECT MAX(number) FROM block;

-- Sample block data
SELECT number, hash, timestamp FROM block ORDER BY number DESC LIMIT 10;
```

## Performance Results

In the benchmark test, this Ponder implementation indexed 10 million Ethereum blocks in **55 hours 37 minutes**.

## Additional Commands

### Run GraphQL API Only (Without Indexing)

```bash
pnpm serve
```

### Check Indexing Status

```bash
pnpm ponder status
```

### Change Block Range

To modify the block range:
1. Edit the `blockRange` property in `ponder.config.ts`
2. Restart the server

For more details on Ponder development, refer to the [official documentation](https://ponder.sh/docs). 