# Sqd — External Contract Calls

The processor hands [`src/main.ts`](./src/main.ts) a batch of blocks, so the
handler decodes the batch first and then issues every allowance read at once
through `Promise.all`. The RPC client's concurrency is raised above its default
so the endpoint, rather than the client's own queue, is what limits the run.

See the [case README](../README.md) for the scenario and the shared rules.

```bash
pnpm install && pnpm codegen && pnpm typegen && pnpm build
docker compose up -d
SQD_END_BLOCK=25601199 RPC_ENDPOINT=<endpoint> pnpm process
```

Ingesting from the SQD archive needs `SQD_API_KEY`, from
[portal.sqd.dev](https://portal.sqd.dev).
