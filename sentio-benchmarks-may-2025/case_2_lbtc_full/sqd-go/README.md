# sqd-go Implementation - LBTC Full Benchmark

An [sqd-go](https://github.com/subsquid-labs/sqd-go) implementation of case_2's
balance + points tracking — **with no RPC calls**. This is `config.yaml` +
`custom_schema.go` + `custom_processor.go` only; sqd-go itself is a sibling
checkout (see [`../case_1_lbtc_event_only/sqd-go/README.md`](../../case_1_lbtc_event_only/sqd-go/README.md)
for the same prerequisite). `../run.ts` builds and drives it with `--state`.

## How this differs from the reference implementations

The case_2 spec calls each account's `balanceOf()` over RPC after every
transfer that touches it. This implementation has no RPC endpoint at all —
per the "ignore RPC calls" scope for this benchmark — so it derives balances
the alternative way: **summing Transfer deltas**. For a standard ERC20 like
LBTC (mints/burns also emit `Transfer` from/to the zero address, handled the
same as any other transfer), the running sum of in/out is mathematically
identical to `balanceOf()`, *provided indexing starts from the contract's
true genesis*. That's why `config.yaml` sets `start_block: 20600000` instead
of the official case_2 window's `22400000` — 20,600,000 is where sqd-go's own
`examples/uniswap` and this repo's `case_1_lbtc_event_only/sqd-go` start —
and `end_block` is `22500000`, to cover case_2's window in the same run.

**20,600,000 turned out not to be true genesis.** A first run showed a
handful of accounts with balances near `2^256` and a `sum(points)` around
`1e84` — a `uint256` underflow: those accounts already held LBTC before
20,600,000, so subtracting an outbound transfer from a derived balance of 0
wrapped around instead of going negative, and the garbage balance then
poisoned every later points accrual for that address. `custom_processor.go`
clamps this case to zero instead of wrapping (see the comment at the `Sub`
call). That makes derived balances a **lower bound**, not exact, for any
account that held LBTC before the indexed window — they read low until
enough inbound transfers cover the untracked pre-existing balance. This is
the concrete cost of the no-RPC constraint: RPC's `balanceOf()` is always
exact regardless of start block; deriving from deltas is exact only from
true genesis, which this run doesn't reach.

Points accrue with the reference formula — `balance * (1000/24) *
(hoursSinceLastUpdate)` — evaluated against the pre-transfer balance, same as
the TS reference (`../sqd/src/main.ts`). One behavior is **not** reproduced:
the reference implementations also sweep every idle account hourly so points
keep accruing between transfers. sqd-go's generated hot-state accessors
(`Get`/`GetOrCreate`/`Save`) are keyed lookups only — there's no iterate-all
hook to drive that sweep — so accounts here only accrue points when they're
next touched by a transfer. This benchmark is measuring indexing throughput
with realistic read-after-write-shaped compute, not reproducing exact points
totals; see the case_2 README's "Points Distribution Analysis" for what exact
parity looks like across the other platforms.

## Benchmark specification (as implemented here)

- **Target contract**: LBTC Token (`0x8236a87084f8B84306f72007F36F2618A5634494`)
- **Events indexed**: `Transfer`
- **Block range**: 20,600,000 – 22,500,000 (Ethereum mainnet) — see above for why this is wider than the official 22,400,000–22,500,000 window
- **Data operations**: derived state (balance + points), no RPC
- **State table**: `case_2_lbtc_full.accounts_live` (current balance/points per address), `accounts_log` (full history)

## Setup

```bash
cp .env.example .env   # then set SQD_API_TOKEN
```

## Results

Measured via `bun ../run.ts` (full 20,600,000–22,500,000 range, capped at the
reference Sqd's 34m — completed naturally, well under the cap):

| Metric | Value |
| --- | --- |
| Time to complete | ~9m23s (the underflow-clamp fix is a cheap per-event branch, so this matches the pre-fix baseline run's timing) |
| Blocks | 1,900,001 |
| Events | 342,693 |
| Accounts | 64,179 |
| Max derived balance | 345,292,918,705 (raw units) — sane, no underflow wraparound |
| Sum of points | 348,194,918,143,837,900 — sane; the pre-fix run had `sum(points) ≈ 2.5e84` from the wraparound bug described above |

## Running

```bash
bun ../run.ts
```

Or manually from the sqd-go checkout:

```bash
cd ../../../../sqd-go
go run . start ../open-indexer-benchmark/sentio-benchmarks-may-2025/case_2_lbtc_full/sqd-go --state --restart
```
