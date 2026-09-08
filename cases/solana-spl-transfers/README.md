# Solana USDC Transfers

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
  — every instruction that moves USDC between accounts. Issuance (`mintTo`) and
  redemption (`burn`) change the supply rather than move a balance between
  holders, and are out of scope; over a 200-slot sample they amount to one
  instruction.
- **Slot Range**: 440,000,000 to latest
- **Verification Range**: 440,000,000 to 440,001,999 — 60,175 transfers
- **Features**: `instruction decoding`, `inner instructions`, `transaction metadata join`

## Case Logic

For each **`transferChecked`**: the mint is account slot 1, so the instruction
either is a USDC transfer or is not, and that is decided before the data is
fetched. Store the amount, source, destination and the `authority` signer.

For each **`transfer`**: the accounts are `(source, destination, authority)` and
no mint appears anywhere in the instruction. Which token moved is only knowable
from the transaction's token balances, so either token account's balance record
is read: if one of them holds USDC, the transfer is stored, otherwise it is
dropped. Either account answers it, because SPL Token rejects a transfer
between different mints. Over a 100-slot sample this path carried 1,299 of
2,914 transfers, so it is not a tail case — it is nearly half the scenario.
Why reading balances loses nothing is set out below.

Both apply to inner instructions as well as top-level ones. 68% of USDC
`transferChecked` calls are CPIs from a swap, a lending program or a router, so
an indexer that only sees top-level instructions misses most of them.

### Difference from the upstream package

The Substreams package resolves the unchecked case by asking whether *any*
token balance in the transaction carries the mint. That over-matches every
transaction touching two tokens — which is every swap. This case resolves the
transfer's own two accounts, so the ground truth is a definite answer rather
than a heuristic every implementation would have to reproduce identically.

## Implementations

- **Envio** — [envio/](./envio/) — also the reference the ground truth is
  snapshotted from
- **Squid SDK** — [sqd/](./sqd/) — reads the SQD Portal
- **Carbon** — [carbon/](./carbon/) — reads plain RPC, run locally

A scenario runs the tools it has a project directory for. SubQuery also indexes
Solana and has no implementation here yet; every other tool in the benchmark is
EVM-only. The two RPC rows are listed as unsupported rather than missing:
HyperIndex indexes Solana slots over RPC but not instructions, and SQD serves
Solana only through its Portal.

Carbon reads every block in the range over plain RPC, and there is no shared
Solana endpoint here the way HyperRPC serves the EVM rows. Its row is therefore
measured by hand against an archive node and committed, rather than published
by CI:

```bash
ENVIO_API_TOKEN=your-token SOLANA_RPC_URL=https://your-archive-endpoint \
  node scripts/run-local.ts solana-spl-transfers --commit
```

That runs every implementation the scenario has, renders the table with the
same module CI uses, and writes it into the root README.

## Running the Benchmark

Requires Node 23.6+, Docker, and an [Envio](https://envio.dev) API token for
the ground truth and for HyperSync.

```bash
ENVIO_API_TOKEN=your-token node cases/solana-spl-transfers/run.ts
```

Each indexer indexes the verification range to completion — its database is
then checked against `expected.json` and measured — before re-running for the
throughput window.

`expected.json` is a snapshot of what the Envio project produces over the
verification range — the case's logic is written once, in the indexer, rather
than once there and once in the harness. Regenerate it after changing the mint,
the slot range or the case logic, and review the diff:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts solana-spl-transfers
```

## Why no transfer is missed

`transferChecked` names its own mint, so only the unchecked path has anything
to prove. A token account is either older than the transaction it appears in,
or created inside it:

- **Older** — it has a balance to report, so the transaction's token balances
  carry it and its mint. Reading only the source would still lose transfers,
  because a *freshly created* source has no balance before the transaction:
  over a 100-slot sample that is 538 of 4,266 unchecked transfers. Reading
  either account closes that, and either is enough, because SPL Token rejects a
  transfer whose two accounts hold different mints. Across 4,266 transfers the
  two never disagreed where both were present.
- **Created inside it** — the same transaction carries the
  `initializeAccount` that names its mint, necessarily before the transfer, so
  a transfer out of a brand-new account is still attributable.

The two cases are exhaustive, so the only account both readings miss is one
created *and* closed inside a single transaction: no balance either side, and
nothing but its initialization to identify it.

Measured against an independent reading of HyperSync — instruction calls and
account activity queried directly, decoded, and joined by the same rules — the
verification range holds 57,753 unchecked transfers, 28,361 of them USDC, and
2,320 USDC accounts created in range, with **zero** transfers that the balance
records miss. That reading produced the same 60,175 rows and the same checksum
as the snapshot committed here.

Because the ground truth is now the indexer's own output, that comparison is a
thing done once and recorded rather than a check the generator re-runs: a
transfer this logic cannot see is a transfer neither side sees. The argument
above is what rules the class out; the measurement is what confirmed it.

Instructions from failed transactions never reach the indexers — a query
filtered on `tx_success: false` returns nothing over this range — so no
reverted transfer is counted.

USDC lives entirely on the classic SPL Token program: across 200 slots no
Token-2022 instruction names the mint, and every USDC token account reports
`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` as its owning program. So one
program is the whole story for this token, which is not true of every mint on
Solana.

The slot range is pinned inside HyperSync's Solana retention window, which
currently reaches back to slot 391,000,000 — a request below the floor is
answered from the floor rather than refused, so the ground truth reads the
floor first and fails if the range has aged out.
