# Ponder — External Contract Calls

`context.client.readContract` in [`src/index.ts`](./src/index.ts) reads the
allowance at the event's block. Ponder profiles the reads an indexing function
makes and prefetches them for upcoming events, which is what lets the calls
overlap even though indexing functions run one event at a time.

See the [case README](../README.md) for the scenario and the shared rules.

```bash
pnpm install
PONDER_END_BLOCK=25601199 PONDER_RPC_URL_1=<endpoint> pnpm start
```
