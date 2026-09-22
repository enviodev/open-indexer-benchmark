# The reliability case, as a SubQuery project

Implements the case every reliability project implements: a `Transfer` row per
log with its block and log index, an `Account` balance that the transfers move,
and a `Token` row written from a contract read on the first transfer seen.

This is the one indexer the benchmark runs inside a container, which two of the
scenarios care about. The generated chain runs on the host, so the node is
pointed at `host.docker.internal` rather than at loopback - the driver rewrites
the URL. And the kill and shutdown scenarios signal the `subquery-node` service
rather than the foreground `docker compose up` that started it: killing that
process would leave the node indexing away inside a container the harness had
already written off as dead.
