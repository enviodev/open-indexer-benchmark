# Squid SDK — External Contract Calls

The processor hands [`src/main.ts`](./src/main.ts) a batch of blocks, so the
handler decodes the batch first and then issues every allowance read at once.
They go through `RpcClient.batchCall`, which merges them into JSON-RPC batches:
the generated contract binding sends one HTTP request per read, and at this
volume that costs more in sockets than the round trips it is waiting on.

See the [case README](../README.md) for the scenario and the shared rules.

```bash
pnpm install && pnpm codegen && pnpm typegen && pnpm build
docker compose up -d
SQD_END_BLOCK=25601199 RPC_ENDPOINT=<endpoint> pnpm process
```

`SQD_SOURCE` picks where chain data comes from — `network` for SQD Network
(which needs `SQD_API_KEY`, from [portal.sqd.dev](https://portal.sqd.dev)) or
`rpc`. The RPC endpoint is configured either way: this case's allowance reads
have to go somewhere whichever source the events come from.
