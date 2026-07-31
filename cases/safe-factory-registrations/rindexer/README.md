# Rindexer: Factory Contract Registration

[rindexer](https://rindexer.xyz/) is a no-code EVM indexing framework written in Rust.

This benchmark indexes `ProxyCreation` on the Safe proxy factory v1.3.0 on Ethereum Mainnet from block 24,600,000, and `SafeSetup` on every proxy it creates. The `Safe` contract's `details` carry a `factory` block naming the factory, its `ProxyCreation` event, and the `proxy` input holding the new address.

## Pre-requisites

- [rindexer CLI](https://rindexer.xyz/docs/start-building/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)

### Install rindexer

```bash
curl -L https://rindexer.xyz/install.sh | bash
```

## Setup

1. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

2. Run the indexer:

   ```bash
   ETHEREUM_RPC=https://... RINDEXER_END_BLOCK=24646610 rindexer start all
   ```
