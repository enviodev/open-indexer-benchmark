## Envio SPL Token Transfers

Indexes every USDC transfer made through the SPL Token program on Solana, one
row per instruction — the scenario the
[`substreams-solana-spl-token`](https://github.com/streamingfast/substreams-solana-spl-token)
package implements, which takes a single `token_contract:<mint>` parameter and
writes a `transfer` table.

Two instructions move tokens, and they need different treatment:

- **`transferChecked`** names the mint in its account list, so the mint is a
  server-side filter and nothing arrives that has to be thrown away.
- **`transfer`** does not — its accounts are `(source, destination, authority)`.
  Which token moved is only knowable from the transaction's token balances, so
  the handler reads the source account's own activity. Over a 100-slot sample
  this path carries 1,287 of 2,902 USDC transfers, so it is not a tail case.

The upstream package instead asks whether *any* token balance in the
transaction carries the mint, which over-matches every swap that touches two
tokens. This implementation resolves the transfer's own two accounts; the case
README records the difference.

Instruction layouts come from SPL Token's published Codama IDL, vendored as
`token.idl.json` so a run does not depend on fetching it. Codegen reports two
instructions it cannot index from that IDL — `batch` and `uiAmountToAmount`,
both of whose argument types Borsh cannot size — and neither is one this case
reads.

### Run

```bash
pnpm dev
```

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

### Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

### Test

```bash
pnpm test
```

Processes a 20-slot window against HyperSync and checks that both the checked
and unchecked paths produce rows. Needs `ENVIO_API_TOKEN`.

### Pre-requisites

- [Node.js v22+ (v24 recommended)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/)
