# Subgraph Implementation - LBTC Full Benchmark

This directory contains a Subgraph implementation for indexing LBTC token transfers with on-chain balance tracking, demonstrating The Graph's ability to handle complex data relationships and derived metrics.

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

#### Alternative: Using Goldsky or Self-Hosted

```bash
goldsky subgraph deploy lbtc_full/1.0.0 --path .
```

## Project Structure

- `src/` - Contains mapping files (AssemblyScript code) with balance tracking logic
- `abis/` - Contains ABI definitions for the LBTC contract
- `generated/` - Auto-generated AssemblyScript files
- `build/` - Compiled subgraph
- `subgraph.yaml` - Subgraph manifest defining data sources and mappings
- `schema.graphql` - GraphQL schema defining Transfer, Account, and Snapshot entities

## Implementation Details

This implementation:
1. Tracks Transfer events from the LBTC token contract
2. Updates Account entities with current token balances
3. Creates Snapshot entities to record historical balance changes
4. Demonstrates The Graph's ability to derive and maintain state from event data

The schema for this implementation includes multiple entity types:

```graphql
type Transfer @entity {
  id: ID!
  from: Account!
  to: Account!
  value: BigInt!
  blockNumber: BigInt!
  blockTimestamp: BigInt!
  transactionHash: String!
}

type Account @entity {
  id: ID!
  balance: BigInt!
  transfersFrom: [Transfer!]! @derivedFrom(field: "from")
  transfersTo: [Transfer!]! @derivedFrom(field: "to")
  snapshots: [Snapshot!]! @derivedFrom(field: "account")
}

type Snapshot @entity {
  id: ID!
  account: Account!
  balance: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
}
```

The mapping handlers process Transfer events and update the related entities accordingly:

```typescript
export function handleTransfer(event: TransferEvent): void {
  // Create or update Account entities
  let fromAccount = loadOrCreateAccount(event.params.from)
  let toAccount = loadOrCreateAccount(event.params.to)
  
  // Adjust balances
  fromAccount.balance = fromAccount.balance.minus(event.params.value)
  toAccount.balance = toAccount.balance.plus(event.params.value)
  
  // Save accounts
  fromAccount.save()
  toAccount.save()
  
  // Create snapshots
  createSnapshot(fromAccount, event)
  createSnapshot(toAccount, event)
  
  // Create transfer entity
  // ...
}
```

## Performance Results

In the benchmark test, this Subgraph implementation indexed LBTC transfers with balance tracking in **18 hours 38 minutes**. This longer processing time (compared to simple event indexing) reflects the additional complexity of maintaining and updating account state and creating snapshots.

## Additional Commands

### Local Development & Testing

```bash
# Start a local Graph Node
docker-compose up

# Create a local subgraph
graph create --node http://localhost:8020/ lbtc_full

# Deploy to local Graph Node
graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 lbtc_full
```

### Query Example

Once deployed, you can query the subgraph with GraphQL:

```graphql
{
  accounts(first: 5, orderBy: balance, orderDirection: desc) {
    id
    balance
    snapshots(first: 3, orderBy: blockNumber, orderDirection: desc) {
      balance
      blockNumber
    }
  }
}
```

For more details on working with subgraphs, refer to [The Graph documentation](https://thegraph.com/docs/en/subgraphs/quick-start/). 