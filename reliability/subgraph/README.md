# The reliability case, as a subgraph

Two rows run this directory unchanged: Graph Node, and the same subgraph on
[HyperIndex](https://envio.dev) as the Envio Subgraph row. Nothing here is
specific to either — it is one manifest, one schema and one set of
AssemblyScript mappings, which is what makes the two rows a reading of the same
subgraph on two indexers rather than two ports of one idea.

What it implements is the case every reliability project implements: a
`Transfer` row per log with its block and log index, an `Account` balance that
the transfers move, and a `Token` row written from a contract read on the first
transfer seen.

The block range comes from the driver, which renders `subgraph.yaml` from
`subgraph.template.yaml` before codegen: the manifest is the only place a
subgraph can say where to start and stop, and there is no environment override
for it.
