# Envio Implementation - LBTC Event Only Benchmark

This directory contains an Envio implementation for indexing LBTC token transfer events, demonstrating Envio's high-performance event processing capabilities powered by HyperSync technology.

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
- Begin indexing event data from the blockchain
- Process events at high speed using HyperSync technology
- Set up a local GraphQL playground

### 4. Access the GraphQL API

Once running, you can access the GraphQL Playground at:
```
http://localhost:8080
```
Local password is `testing`.

## Project Structure

- `src/` - Contains event handlers and indexing logic
- `config.yaml` - Configuration for networks, contracts, and event handlers
- `schema.graphql` - GraphQL schema definition for entities
- `generated/` - Auto-generated TypeScript files

## Implementation Details

This implementation:
1. Uses Envio's HyperSync technology for ultra-fast blockchain data access
2. Processes Transfer events from the LBTC token contract
3. Demonstrates the performance benefits of HyperSync's optimized data retrieval
4. Uses Envio's powerful event handling and entity management

## Performance Advantages

Envio's HyperSync technology offers:
- Data retrieval up to 2000x faster than traditional RPC methods
- Optimized blockchain scanning with minimal infrastructure requirements
- The ability to stream and process large volumes of historical data efficiently
- Flexible query capabilities to filter and retrieve exactly the data needed

## Performance Results

In the benchmark test, this Envio implementation indexed LBTC transfer events in just **2 minutes**, making it significantly faster than all other implementations for this event-only indexing scenario.

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
# Example query to fetch transfer events
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer testing" \
  --data '{"query": "{ transfers { id from to value } }"}' \
  http://localhost:8080/graphql
```

For more details on Envio and HyperSync, refer to the [official documentation](https://docs.envio.dev).

## Envio Indexer

*Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features*

### Run

```bash
pnpm dev
```

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Pre-requisites

- [Node.js (use v18 or newer)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker desktop](https://www.docker.com/products/docker-desktop/)
 