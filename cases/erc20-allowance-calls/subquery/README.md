# SubQuery — External Contract Calls

[`src/mappings/mappingHandlers.ts`](./src/mappings/mappingHandlers.ts) calls
through `api`, the provider SubQuery gives the mapping, with the block tag pinned
to the event's block. Handlers run one event at a time inside a worker, so the
call parallelism available to this implementation is the worker count.

It runs in Docker, and reaches the benchmark's endpoint through
`host.docker.internal` — mapped to the host gateway in
[`docker-compose.yml`](./docker-compose.yml).

See the [case README](../README.md) for the scenario and the shared rules.

```bash
pnpm install && pnpm codegen && pnpm build
docker compose up
```
