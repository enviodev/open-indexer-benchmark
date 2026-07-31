# Envio: Factory Contract Registration

[Envio HyperIndex](https://docs.envio.dev) implementation of the Safe proxy factory benchmark.

`config.yaml` declares two contracts. `SafeProxyFactory` has an address; `Safe` deliberately has none — every instance is supplied at runtime by `indexer.contractRegister`, which calls `context.chain.Safe.add(proxy)` for each `ProxyCreation`.

### Run

```bash
pnpm dev
```

Visit http://localhost:8080 for the GraphQL Playground; the local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Pre-requisites

- [Node.js v22+ (v24 recommended)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/)
