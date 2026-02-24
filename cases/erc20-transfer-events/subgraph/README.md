# SubGraph (The Graph) — ERC20 Transfer Events

Indexes RocketTokenRETH Transfer and Approval events using [The Graph](https://thegraph.com/) protocol with a local Graph Node.

## Prerequisites

- Node.js 18+
- pnpm
- Docker

## Setup

```bash
pnpm install
```

## Generate Types & Build

```bash
pnpm codegen
pnpm build
```

## Local Development

Start the Graph Node infrastructure (postgres, IPFS, graph-node):

```bash
ETHEREUM_RPC_URL=https://1.rpc.hypersync.xyz/YOUR_TOKEN docker compose up -d
```

Create and deploy the subgraph locally:

```bash
pnpm create-local
pnpm deploy-local
```

Query at `http://localhost:19876/subgraphs/name/erc20-transfer-events`.

## Performance Optimizations

This implementation uses the latest SubGraph features for optimal indexing performance:

- **`specVersion: 1.3.0`** — latest manifest spec
- **`indexerHints.prune: auto`** — automatic historical data pruning to reduce storage overhead and speed up indexing
- **`@entity(immutable: true)`** — on `TransferEvent` and `ApprovalEvent` entities, enabling up to 48% faster indexing for write-only entities
- **`Bytes` IDs with `concatI32()`** — uses native byte concatenation instead of string IDs, providing up to 28% better query performance
- **`ETHEREUM_REORG_THRESHOLD: 1`** — minimizes reorg detection overhead for benchmarking
- **`GRAPH_ETHEREUM_CLEANUP_BLOCKS: 1`** — reduces block cleanup overhead

## Teardown

```bash
docker compose down -v
```
