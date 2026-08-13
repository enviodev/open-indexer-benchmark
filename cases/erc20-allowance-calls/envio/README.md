# Envio — External Contract Calls

The [Effect API](https://docs.envio.dev/docs/HyperIndex/effect-api) is what this
implementation turns on. `createEffect` in
[`src/handlers/ERC20.ts`](./src/handlers/ERC20.ts) wraps the `eth_call`, and the
handler awaits it through `context.effect`, so the reads for a whole batch of
approvals are in flight at the same time during HyperIndex's preload pass rather
than one per event in block order.

The call itself goes through a viem client with request batching on. That is
worth as much as the scheduling: handing thousands of calls to a client that
opens a socket for each costs more than the round trips it is waiting on. On the
verification range, the same 14,114 calls take 12.6s of preload one request each
and 1.6s batched.

What is left after that is the size of a batch, because a batch is the unit of
concurrency: preload puts the whole batch's calls in flight together, so an
indexer holds about as many calls as the batch has non-revoking approvals in it.
`full_batch_size` in [`config.yaml`](./config.yaml) is 20,000 rather than the
default 5,000 for that reason — measured here, 5,000 gives 8,188 events/s at
3,921 calls in flight and 20,000 gives 10,890 at 15,473. It does not keep
climbing: 50,000 falls back to 9,503, where the batch costs more in storage
writes than the concurrency returns.

See the [case README](../README.md) for the scenario and the shared rules.

```bash
pnpm codegen
pnpm start
```

The indexer expects `ENVIO_RPC_URL` to point at the endpoint that serves the
case's contract calls; the benchmark runner sets it.
