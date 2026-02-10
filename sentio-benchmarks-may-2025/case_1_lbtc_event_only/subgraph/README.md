# Subgraph Implementation - LBTC Event Only Benchmark

This directory contains a Subgraph implementation for indexing LBTC token transfer events using The Graph protocol.

## Prerequisites

* **Node.js:** v16 or newer
* **Yarn** or **NPM** package manager
* **A crypto wallet** with testnet funds (if deploying to The Graph Network)
* **Graph CLI:** `npm install -g @graphprotocol/graph-cli@latest`

## Setup & Running Instructions

### 1. Install Dependencies

```bash
yarn install
```

### 2. Generate Types and Build

```bash
yarn codegen && yarn build
```

This command:
- Generates AssemblyScript types for your GraphQL schema and smart contract ABIs
- Compiles the subgraph into WebAssembly

### 3. Deploy to The Graph Network

#### Using Studio

First, authenticate with Subgraph Studio:

```bash
graph auth <DEPLOY_KEY>
```

Then deploy your subgraph:

```bash
graph deploy <SUBGRAPH_SLUG>
```

#### Alternative: Using Goldsky

```bash
goldsky subgraph deploy lbtc_transfer_only/1.0.0 --path .
```

## Project Structure

- `src/` - Contains mapping files (AssemblyScript code)
- `abis/` - Contains ABI definitions for the LBTC contract
- `generated/` - Auto-generated AssemblyScript files
- `build/` - Compiled subgraph
- `subgraph.yaml` - Subgraph manifest defining data sources and mappings
- `schema.graphql` - GraphQL schema defining entity types

## Implementation Details

This implementation:
1. Tracks Transfer events from the LBTC token contract
2. Maps the event data to Transfer entities defined in the schema
3. Stores the indexed data in a decentralized network of Indexers

The main configuration is in `subgraph.yaml`, which defines:
- The contract address to monitor
- The events to track (Transfer events)
- The mapping handlers that process the events

### Example Entity Model in schema.graphql:

```graphql
type Transfer @entity {
  id: ID!
  from: String!
  to: String!
  value: BigInt!
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: String!
}
```

## Performance Results

In the benchmark test, this Subgraph implementation indexed LBTC transfer events in **3 hours 9 minutes**, demonstrating the trade-offs between decentralization and pure indexing speed.

## Additional Commands

### Local Development & Testing

```bash
# Start a local Graph Node
docker-compose up

# Create a local subgraph
graph create --node http://localhost:8020/ lbtc_transfer_only

# Deploy to local Graph Node
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 lbtc_transfer_only
```

### Query Example

Once deployed, you can query the subgraph with GraphQL:

```graphql
{
  transfers(first: 5, orderBy: blockNumber, orderDirection: desc) {
    id
    from
    to
    value
    blockNumber
  }
}
```

For more details on working with subgraphs, refer to [The Graph documentation](https://thegraph.com/docs/en/subgraphs/quick-start/).


