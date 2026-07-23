# sqd-go Implementation

An [sqd-go](https://github.com/subsquid-labs/sqd-go) implementation of this
case: raw USDC `Transfer` event decoding and storage, no aggregation. This is
`config.yaml` only — no custom processor, so no `--state` flag. sqd-go itself
is a sibling checkout (see the repo root for the expected layout); `../run.ts`
builds and drives it via the `sqd-go` entry in its `BENCHMARKS` registry.

## Setup

```bash
cp .env.example .env   # then set SQD_API_TOKEN (portal.sqd.dev)
```

## Results

Measured via `node ../run.ts sqd-go` (60s window, the case's default), using
`--parallel-fetch` with `SQD_PARALLEL_FETCHERS=12 SQD_PARALLEL_RPS=10` (see
`../run.ts` — sqd-go's own Makefile uses this preset for its fastest runs;
without it this case ran at only ~3,123 blocks/s):

| Metric | Value |
| --- | --- |
| blocks/s | 6,173.9 |
| events/s | 56,450.6 |
| CPU (user+sys) | 16.6s over a 60s window |
| peak RSS | 1,567MB |

Against the reference table in the case README: 2nd fastest on both axes,
behind Envio (7,145.5 blocks/s / 64,482.8 events/s) and now ~4.3x/5.0x ahead
of Sqd/TS Subsquid (1,430.9 blocks/s / 11,324.0 events/s).

**Sqd/TS Subsquid could not be re-measured in this environment** for a
head-to-head CPU/mem comparison — see the same-named section in
[`../../erc20-account-balances/sqd-go/README.md`](../../erc20-account-balances/sqd-go/README.md)
for why (a v2-Archive-vs-Portal credentials mismatch, not a bug here). The
comparison above uses the case README's own published Sqd/TS numbers;
CPU/mem for Sqd/TS is unmeasured.

## Running

Part of the case-level harness:

```bash
node ../run.ts sqd-go
```

Or manually from the sqd-go checkout:

```bash
cd ../../../../sqd-go
go run . start ../open-indexer-benchmark/cases/erc20-transfer-events/sqd-go --restart
```

Generated table: `erc20_transfer_events_sqd_go.usdc_transfer_events`.
