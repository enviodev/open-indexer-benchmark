[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/subsquid/squid-evm-template)

# Subsquid Implementation - LBTC Event Only Benchmark

This directory contains a Subsquid implementation for indexing LBTC token transfer events using the Subsquid SDK and SQD Network.

## Prerequisites

* **Node.js:** v18 or newer
* **Git**
* **Docker** (for running Postgres)
* **Squid CLI:** `npm i -g @subsquid/cli`

## Setup & Running Instructions

### 1. Install Dependencies

```bash
npm i
```

### 2. Start PostgreSQL Database

```bash
sqd up
```

This starts a local PostgreSQL database in a Docker container for storing indexed data.

### 3. Build the Squid

```bash
sqd build
```

### 4. Apply Database Migrations

```bash
sqd migration generate
sqd migration apply
```

### 5. Start the Squid

Run both the processor and GraphQL server:

```bash
sqd run .
```

Alternatively, run services individually:

```bash
# Start processor only
sqd process

# Start GraphQL server only
sqd serve
```

### 6. Access the GraphQL API

Once running, access the GraphQL playground at:
```
http://localhost:4350/graphql
```

## Project Structure

- `src/` - Contains processor configuration and event handlers
- `lib/` - Compiled JavaScript output
- `abi/` - ABI definitions for the LBTC contract
- `schema.graphql` - GraphQL schema defining the database structure
- `db/migrations/` - Database migration files
- `squid.yaml` - Squid configuration

## Implementation Details

This implementation:
1. Uses `EvmBatchProcessor` to fetch LBTC token Transfer events
2. Uses SQD Network as the primary data source for optimized data retrieval
3. Decodes event data and saves it to a local Postgres database
4. Provides a GraphQL API for querying transfer data

The main processor configuration is in `src/processor.ts`:

```typescript
const processor = new EvmBatchProcessor()
  .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
  .setRpcEndpoint('https://rpc.ankr.com/eth')
  .setFinalityConfirmation(75)
  .addLog({
    range: { from: 20016816 },
    address: [LBTC_CONTRACT_ADDRESS],
    topic0: [erc20abi.events.Transfer.topic],
  })
```

## Performance Results

In the benchmark test, this Subsquid implementation indexed LBTC transfer events in **10 minutes**, demonstrating efficient performance for event-only indexing.

## Additional Commands

### Typegen (Generate TypeScript interfaces from ABIs)

```bash
sqd typegen
```

### Reset Database

```bash
sqd down
sqd up
```

### Get Logs

```bash
sqd logs
```

### Deploy to SQD Cloud

```bash
sqd deploy --org <org-name> .
```

## Database Access

Connect to the PostgreSQL database directly:

```bash
PGPASSWORD="kbr06QnqfXX66cb7Bm9Qdovvx6TvU8C~" psql -h pg.squid.subsquid.io -d 16177_ku9u1f -U 16177_ku9u1f
```

Example query:
```sql
SELECT COUNT(*) FROM transfer;
```

For more details on Subsquid SDK, refer to the [official documentation](https://docs.sqd.ai/sdk/quickstart/).


