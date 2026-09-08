# Solana Token Transfers

Index every USDC transfer made through the SPL Token program on Solana from
slot 440,000,000. Write one row per transfer.

The scenario is the one
[`substreams-solana-spl-token`](https://github.com/streamingfast/substreams-solana-spl-token)
implements: a single `token_contract:<mint>` parameter, and a `transfer` table
holding the amount, the two token accounts and the signer.

## Benchmark Specification

- **Program**: SPL Token (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
- **Mint**: USD Coin (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
- **Instructions Indexed**: `transfer` (`0x03`) and `transferChecked` (`0x0c`)
- **Slot Range**: 440,000,000 to latest
- **Verification Range**: 440,000,000 to 440,001,999 — 60,026 transfers
- **Features**: `instruction decoding`, `inner instructions`, `transaction metadata join`

## Case Logic

For each **`transferChecked`**: the mint is account slot 1, so the instruction
either is a USDC transfer or is not, and that is decided before the data is
fetched. Store the amount, source, destination and the `authority` signer.

For each **`transfer`**: the accounts are `(source, destination, authority)` and
no mint appears anywhere in the instruction. Which token moved is only knowable
from the transaction's token balances, so the source account's own balance
record is read: if it holds USDC, the transfer is stored, otherwise it is
dropped. Over a 100-slot sample this path carried 1,287 of 2,902 transfers, so
it is not a tail case — it is nearly half the scenario.

Both apply to inner instructions as well as top-level ones. 68% of USDC
`transferChecked` calls are CPIs from a swap, a lending program or a router, so
an indexer that only sees top-level instructions misses most of them.

### Difference from the upstream package

The Substreams package resolves the unchecked case by asking whether *any*
token balance in the transaction carries the mint. That over-matches every
transaction touching two tokens — which is every swap. This case resolves the
source account exactly, so the ground truth is a definite answer rather than a
heuristic every implementation would have to reproduce identically.

## Implementations

- **Envio** — [envio/](./envio/)

SubQuery and the Squid SDK both index Solana and have no implementation here
yet; every other tool in the benchmark is EVM-only and appears in the table as a
dashed row with the reason.

## Running the Benchmark

Requires Node 23.6+, Docker, and an [Envio](https://envio.dev) API token for
the ground truth and for HyperSync.

```bash
ENVIO_API_TOKEN=your-token node cases/solana-spl-transfers/run.ts
```

Each indexer indexes the verification range to completion — its database is
then checked against `expected.json` and measured — before re-running for the
throughput window.

Regenerate the ground truth after changing the mint, the slot range or the case
logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts solana-spl-transfers
```

## Notes

The slot range is pinned inside HyperSync's Solana retention window, which
currently reaches back to slot 391,000,000 — a request below the floor is
answered from the floor rather than refused, so the ground truth asserts the
range it asked for is the range it got.
