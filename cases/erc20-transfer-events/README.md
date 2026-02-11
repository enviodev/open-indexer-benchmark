# ERC20 Transfer Events

This benchmark is inspired by the one used on the [Ponder landing page](https://ponder.sh/).

Index the Rocket Pool ERC20 token contract (RocketTokenRETH) on Ethereum Mainnet from block 18,600,000. Write decoded event logs + aggregate account balances in a database.

## Benchmark Specification

- **Target Contract**: RocketTokenRETH (Rocket Pool)
- **Events Indexed**: Transfer and Approval events
- **Block Range**: 18,600,000 to latest
- **Features**: `event decoding`, `storage write`, `storage update on conflict`

## Case Logic

For each **Transfer** event:

1. Upsert the sender account: if it exists, subtract the transfer value from its balance; otherwise, create it with a zero balance.
2. Upsert the recipient account: if it exists, add the transfer value to its balance; otherwise, create it with a zero balance.
3. Insert a transfer event record with the event id, amount, timestamp, sender, and recipient.

For each **Approval** event:

1. Upsert the allowance record keyed by (owner, spender): if it exists, update the amount; otherwise, create it with the approved value.
2. Insert an approval event record with the event id, amount, timestamp, owner, and spender.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, and an [Envio](https://envio.dev) API token for the RPC endpoint.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts
```

By default the benchmark runs for 60 seconds. Pass a custom duration (in seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-transfer-events/run.ts --duration=60
```
