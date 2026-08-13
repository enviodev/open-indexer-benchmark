# Subgraph — External Contract Calls

Graph Node's mappings are single-threaded and their contract calls synchronous,
so the manifest declares the call
([`subgraph.template.yaml`](./subgraph.template.yaml)):

```yaml
calls:
  allowance: ERC20[event.address].allowance(event.params.owner, event.params.spender)
```

Declared calls are fetched in parallel before the handler runs, so the
`allowance` call in [`src/mapping.ts`](./src/mapping.ts) is answered from what
was already prefetched.

`subgraph.yaml` is generated from the template by the benchmark driver, which
bakes in the block range for the phase being run.

See the [case README](../README.md) for the scenario and the shared rules.
