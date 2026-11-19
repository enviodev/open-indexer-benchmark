# envio CLI for the Envio Subgraph tool

The `envio-subgraph` tool runs each scenario's existing `subgraph/` directory
on HyperIndex. That directory is the Subgraph tool's project and stays exactly
as Graph Node reads it, so the CLI cannot be a dependency of it — it is
installed here instead, once, and shared across scenarios the way the Graph
Node binary is.

The driver runs `envio start -r` with the scenario's `subgraph/` as the working
directory. There is no `config.yaml` there, and that is what puts envio into
subgraph mode: it reads `subgraph.yaml`, translates it, and on start builds
`generated/` with the project's own graph-cli.

`envio` is pinned here. Since 3.15 it pulls in no package with a build
script, so the install needs no `allowBuilds` acknowledgement under pnpm 11.
