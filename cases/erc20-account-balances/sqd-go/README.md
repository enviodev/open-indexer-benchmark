# sqd-go Implementation

An [sqd-go](https://github.com/subsquid-labs/sqd-go) implementation of this
case: RocketTokenRETH `Transfer` + `Approval` event indexing with derived
account balances and (owner, spender) allowances — **no RPC calls**. Unlike
the LBTC case_2 benchmark in `sentio-benchmarks-may-2025/`, this case's own
reference logic already assumes a zero starting balance ("if it exists,
subtract/add; otherwise create with zero balance" — see the case README's
"Case Logic"), so deriving from event deltas isn't a deviation from the
reference here, just a different way to reach the same logic without RPC.

sqd-go itself is a sibling checkout; `../run.ts` builds and drives it with
`--state` (needed because of the custom processor) via the `sqd-go` entry in
its `BENCHMARKS` registry.

## Setup

```bash
cp .env.example .env   # then set SQD_API_TOKEN (portal.sqd.dev)
```

## Results

Measured via `node ../run.ts sqd-go` (60s window, the case's default), using
`--parallel-fetch` with `SQD_PARALLEL_FETCHERS=12 SQD_PARALLEL_RPS=10` (see
`../run.ts` — sqd-go's own Makefile uses this preset for its fastest runs;
without it this case ran at only ~2,931 blocks/s):

| Metric | Value |
| --- | --- |
| blocks/s | 6,246.6 |
| events/s | 899.3 |
| CPU (user+sys) | 5.6s over a 60s window |
| peak RSS | 434MB |

Against the reference table in the case README, this now beats Sqd/TS
Subsquid on both axes (4,957.8 blocks/s / 727.1 events/s), and is 2nd overall
behind only Envio (97,873.1 blocks/s / 12,170.2 events/s).

**Sqd/TS Subsquid could not be re-measured in this environment** to get a
head-to-head CPU/mem comparison: as of 19 May 2026 the `v2.archive.subsquid.io`
endpoint the TS SDK targets requires an API key, and the only key available
here (a Portal/boost-tier key, used for sqd-go above) gets a genuine HTTP 403
from that endpoint (`ArchiveCredentialsError: CREDENTIALS_INVALID`, traced
into `@subsquid/util-internal-archive-client`'s source — not a bug in this
harness). Portal and v2 Archive are apparently separately-entitled products.
The blocks/s and events/s comparison above uses the case README's own
published Sqd/TS numbers; CPU/mem for Sqd/TS is unmeasured.

## Running

Part of the case-level harness:

```bash
node ../run.ts sqd-go
```

Or manually from the sqd-go checkout:

```bash
cd ../../../../sqd-go
go run . start ../open-indexer-benchmark/cases/erc20-account-balances/sqd-go --state --restart
```

Generated tables: `erc20_account_balances_sqd_go.rocket_token_reth_transfer_events`,
`rocket_token_reth_approval_events`, `accounts_live`/`accounts_log`,
`allowances_live`/`allowances_log`.
