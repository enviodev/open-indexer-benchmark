# Ponder Implementation - LBTC Full Benchmark

This directory contains a Ponder implementation for indexing LBTC token transfers with RPC calls to fetch token balances, demonstrating Ponder's ability to handle complex data relationships and contract interactions.

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

- `src/` - Contains indexing functions with RPC calls for balance fetching
- `abis/` - Contract ABIs
- `ponder.config.ts` - Configuration for networks and contracts
- `ponder.schema.ts` - Schema with entities for transfers, accounts, and snapshots
- `.env.local` - Environment variables including RPC URLs

## Implementation Details

This implementation:
1. Processes Transfer events from the LBTC token contract
2. Makes balanceOf() RPC calls to fetch current balances for senders and receivers
3. Creates and updates Account entities with the latest balance information
4. Creates Snapshot entities to record historical balance changes
5. Demonstrates Ponder's ability to handle read-after-write operations and complex entity relationships

## Database Access

Connect to the PostgreSQL database:

```bash
PGPASSWORD="OlKFhKmUqTqTvHzpGBuZOPuOFhAIbold" psql -h yamabiko.proxy.rlwy.net -p 10767 -U postgres -d railway
```

Set the search path:
```sql
SET search_path TO "99ac6069-d39a-4622-8d96-8f8121a42b7b";
```

Example queries:
```sql
-- Count all tables
SELECT COUNT(*) FROM lbtc_transfer;
SELECT COUNT(*) FROM accounts;
SELECT COUNT(*) FROM snapshot;
```

## Performance Results

In the benchmark test, this Ponder implementation indexed LBTC transfers with RPC calls in **4 hours 38 minutes**.

## Additional Commands

### Run GraphQL API Only (Without Indexing)

```bash
pnpm serve
```

### Check Indexing Status

```bash
pnpm ponder status
```

### Reset Database and Re-index

```bash
pnpm ponder reset
```

For more details on Ponder development, refer to the [official documentation](https://ponder.sh/docs).