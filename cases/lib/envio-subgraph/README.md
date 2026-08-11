# envio CLI for the Envio Subgraph tool

The `envio-subgraph` tool runs each scenario's existing `subgraph/` directory
on HyperIndex. That directory is the Subgraph tool's project and stays exactly
as Graph Node reads it, so the CLI cannot be a dependency of it — it is
installed here instead, once, and shared across scenarios the way the Graph
Node binary is.

The driver runs `envio start -r` with the scenario's `subgraph/` as the working
directory. There is no `config.yaml` there, and that is what puts envio into
subgraph mode: it reads `subgraph.yaml`, translates it, and builds `generated/`
with the project's own graph-cli.

`envio` is pinned here, and `pnpm-workspace.yaml` acknowledges the one build
script the install skips — pnpm 11 treats a skipped one as fatal, and esbuild's
only picks a platform binary pnpm already installs as an optional dependency.
