## Squid SDK SPL Token Transfers

Indexes every USDC transfer made through the SPL Token program on Solana, one
row per instruction.

SQD serves Solana through its [Portal](https://portal.sqd.dev) rather than the
SQD Network gateway the EVM scenarios read, and there is no RPC source to
switch to, so this project has none of their `SQD_SOURCE` branching.

`transferChecked` names its mint in account slot 1, so the Portal filters on it
through `accountSelection` and nothing arrives that has to be discarded. Plain
`transfer` names no mint at all, so every one of them is read and the
transaction's token balances decide — `preMint` for an account older than the
transaction, `postMint` for one the transaction opened.

Instruction layouts are hand-written in `src/abi/token-program.ts`: SPL Token
dispatches on a single leading byte rather than an eight-byte Anchor
discriminator, so there is no IDL to generate from.

### Run

```bash
pnpm install
pnpm codegen
pnpm build
docker compose up -d
npx squid-typeorm-migration generate && npx squid-typeorm-migration apply
SQD_END_BLOCK=440001999 pnpm process
```

Needs `SQD_API_KEY` from [portal.sqd.dev](https://portal.sqd.dev) in `.env`.
