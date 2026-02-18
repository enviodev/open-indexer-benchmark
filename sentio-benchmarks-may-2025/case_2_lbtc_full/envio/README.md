# Envio Implementation - LBTC Full Benchmark

This directory contains an Envio implementation for indexing LBTC token transfers with RPC calls to fetch token balances, demonstrating Envio's ability to handle complex data relationships and contract interactions.

## Prerequisites

- [Node.js (v18 or newer)](https://nodejs.org/en/download/current)
- [pnpm (v8 or newer)](https://pnpm.io/installation)
- [Docker desktop](https://www.docker.com/products/docker-desktop/)

## Setup & Running Instructions

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Generate TypeScript Files from Config and Schema

```bash
pnpm codegen
```

### 3. Start the Development Server

```bash
pnpm dev
```

This will:

- Start the local indexer service
- Begin indexing event data with RPC calls using HyperSync technology
- Process events and fetch token balances
- Set up a local GraphQL playground

### 4. Access the GraphQL API

Once running, you can access the GraphQL Playground at:

```
http://localhost:8080
```

Local password is `testing`.

## Project Structure

- `src/` - Contains event handlers and RPC call logic
- `config.yaml` - Configuration for networks, contracts, and event handlers
- `schema.graphql` - GraphQL schema definition for transfers, accounts, and snapshots
- `generated/` - Auto-generated TypeScript files

## Implementation Details

This implementation:

1. Uses Envio's HyperSync technology for ultra-fast blockchain data access
2. Processes Transfer events from the LBTC token contract
3. Makes balanceOf() RPC calls to fetch current token balances
4. The use of [Loaders and Effect API](https://docs.envio.dev/docs/HyperIndex/loaders) optimises performance by batching RPC calls and making data retrieval in parallel
5. Creates and updates Account entities with balance information
6. Creates Snapshot entities to track historical balances
7. Demonstrates Envio's ability to handle read-after-write operations

## Performance Advantages

Envio's HyperSync technology offers significant advantages for this complex use case:

- Optimized RPC call handling with minimized latency
- Efficient data retrieval with field selection to reduce bandwidth
- Flexible join modes to control how related data is connected
- Transaction streaming with automatic retry and error handling

## Additional Commands

### Run Tests

```bash
pnpm test
```

### Build for Production

```bash
pnpm build
```

### Query Indexed Data

```bash
# Example query to fetch account balances
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer testing" \
  --data '{"query": "{ accounts { id balance lastUpdated } }"}' \
  http://localhost:8080/graphql
```

For more details on Envio and HyperSync, refer to the [official documentation](https://docs.envio.dev).
