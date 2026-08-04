# Ponder: Factory Contract Registration

[Ponder](https://ponder.sh) implementation of the Safe proxy factory benchmark.

The `Safe` contract is declared with `factory({ address, event, parameter })`, pointing at the proxy factory's `ProxyCreation` event and its `proxy` argument. Ponder resolves the child address set from the factory's logs before matching child logs against it, rather than discovering children as it walks the stream.

## Setup

Requires Node.js >= 18 and Docker (for PostgreSQL).

```bash
pnpm install
```

## Running locally

```bash
PONDER_RPC_URL_1=https://... PONDER_END_BLOCK=24646610 pnpm dev
```

The GraphQL endpoint is served at `http://localhost:42069`.
