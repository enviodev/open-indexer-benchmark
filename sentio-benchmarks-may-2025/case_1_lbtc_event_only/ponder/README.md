# Ponder Implementation - LBTC Event Only Benchmark

This directory contains a Ponder implementation for indexing LBTC token transfer events.

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
- Begin indexing data from the blockchain
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

- `src/` - Contains indexing functions
- `abis/` - Contract ABIs
- `ponder.config.ts` - Configuration for networks and contracts
- `ponder.schema.ts` - Database schema definition
- `.env.local` - Environment variables including RPC URLs

## Database Access

Connect to the PostgreSQL database:

```bash
PGPASSWORD="IaYFUoJeDdJXgiTXXXOZmaNkjjXjkBZJ" psql -h shinkansen.proxy.rlwy.net -p 29835 -U postgres -d railway
```

Set the search path to the Ponder schema:
```sql
SET search_path TO "dd7eb67f-c91a-4359-a6a7-fc1fdf31c305";
```

Example queries:
```sql
-- Count records in the lbtc_transfer table
SELECT COUNT(*) FROM lbtc_transfer where block_number <= 22210921;

-- View sample data
SELECT * FROM lbtc_transfer LIMIT 10;
```

## Performance Results

In the benchmark test, this Ponder implementation indexed LBTC transfer events in **1 hour 40 minutes**, with approximately 5% of data missing.

## Additional Commands

### Run GraphQL API Only (Without Indexing)

```bash
pnpm serve
```

### Check Indexing Status

```bash
pnpm ponder status
```

For more details on Ponder development, refer to the [official documentation](https://ponder.sh/docs).