# Subgraph Implementation - Ethereum Block Benchmark

This directory contains a Subgraph implementation for indexing Ethereum blocks, creating entities for each block with comprehensive metadata.

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
goldsky subgraph deploy ethereum_block/1.0.0 --path .
```

## Project Structure

- `src/` - Contains mapping files with block handlers
- `generated/` - Auto-generated AssemblyScript files
- `build/` - Compiled subgraph
- `subgraph.yaml` - Subgraph manifest defining the data source
- `schema.graphql` - GraphQL schema defining the Block entity

## Implementation Details

This implementation:
1. Uses block handlers to process Ethereum blocks from 0 to 10,000,000
2. Extracts comprehensive block metadata, including:
   - Block number, hash, and parent hash
   - Timestamp
   - Gas used and gas limit
   - Difficulty and total difficulty
   - Size and transaction count
   - Miner address
3. Creates Block entities with the extracted data
4. Provides a GraphQL API for querying block information

The schema defines a comprehensive Block entity:

```graphql
type Block @entity {
  id: ID!
  number: BigInt!
  hash: String!
  parentHash: String!
  timestamp: BigInt!
  gasUsed: BigInt!
  gasLimit: BigInt!
  difficulty: BigInt!
  totalDifficulty: BigInt!
  size: BigInt!
  miner: String!
  transactionCount: Int!
}
```

The block handler processes each block:

```typescript
export function handleBlock(block: ethereum.Block): void {
  let entity = new Block(block.hash.toHexString())
  
  entity.number = block.number
  entity.hash = block.hash.toHexString()
  entity.parentHash = block.parentHash.toHexString()
  entity.timestamp = block.timestamp
  entity.gasUsed = block.gasUsed
  entity.gasLimit = block.gasLimit
  entity.difficulty = block.difficulty
  entity.totalDifficulty = block.totalDifficulty
  entity.size = block.size
  entity.miner = block.miner.toHexString()
  entity.transactionCount = block.transactions.length
  
  entity.save()
}
```

## Performance Results

In the benchmark test, this Subgraph implementation indexed 10 million Ethereum blocks in **24 hours**, demonstrating The Graph's capability for processing high volumes of block-level data.

## Additional Commands

### Local Development & Testing

```bash
# Start a local Graph Node
docker-compose up

# Create a local subgraph
graph create --node http://localhost:8020/ ethereum_block

# Deploy to local Graph Node
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 ethereum_block
```

### Query Example

Once deployed, you can query the subgraph with GraphQL:

```graphql
{
  blocks(first: 5, orderBy: number, orderDirection: desc) {
    id
    number
    hash
    timestamp
    gasUsed
    miner
    transactionCount
  }
}
```

For more details on working with subgraphs, refer to [The Graph documentation](https://thegraph.com/docs/en/subgraphs/quick-start/).


