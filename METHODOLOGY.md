# Methodology

Each scenario runs twice. Once over a fixed block range, to check the indexer's data against ground truth and measure it on disk. Once as a timed window, to measure how fast it goes. Everything runs in GitHub CI on `ubuntu-latest`, one job per tool per source, each started the way that tool's own documentation recommends for production.

What the result table columns mean:

**events/s, blocks/s** — measured over a 100-second window that stops short of the chain head, so it is backfill speed rather than head tracking. The window runs twice and the better rate is reported. A tool too slow to get through the fixed range in that time reports the rate it managed there instead.

**data** — ✅ every row matches ground truth, ❌ it does not, ❓ only part of the range got indexed, or the check could not run. Ground truth is built by replaying each scenario's documented logic over [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) logs. Anything but ✅ carries a numbered note under the table.

**storage** — the scenario's own tables and indexes, excluding each tool's internal bookkeeping. A `~` means the tool covered part of the range and the figure is scaled up from what it did index.

**source** — where the tool reads chain data. A tool is benchmarked once per source it supports, so a fast tool on a slow source is not mistaken for a slow tool. The Envio Indexer reads [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) or RPC, the [Squid SDK](https://sqd.dev/sdk/) reads [SQD Network](https://docs.sqd.dev/en/network/overview) or RPC; tools without their own pipeline read RPC only. Every RPC row is the same endpoint, [Envio HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc).

**Envio Subgraph** is not a separate implementation. It runs the scenario's existing `subgraph/` directory — the same manifest, schema, ABIs and AssemblyScript mappings Graph Node indexes — on [HyperIndex](https://envio.dev), with nothing added to that directory. The two rows are therefore a like-for-like reading of one subgraph on two indexers, rather than two ports of the same idea. Like the Envio Indexer it is benchmarked once per source it supports, HyperSync and RPC. It runs a released envio from npm, pinned in `cases/lib/envio-subgraph`, the same way Graph Node runs a released binary.

**contract calls** — a scenario whose handlers read contract state does not read it from a real node. The benchmark answers those calls itself, at a fixed latency, from the call's own arguments, so every tool waits exactly as long for exactly the same answers. Nothing limits how many it will answer at once, which leaves how many an indexer has outstanding the one thing the scenario measures. Any other call is refused rather than answered, and the answers appear in no log, so a matching checksum is proof the calls were really made.

The verification run is capped at five minutes. An indexer that has not finished by then is stopped there and verified on what it indexed, so it still gets a rate and a note saying how much data is missing.

Each scenario's own page documents its block range, contracts, entities and per-tool implementation notes.

## Reliability

The reliability scenarios are measured differently and deliberately so. They run against a chain this repository generates in-process rather than against Ethereum, because what they test cannot be requested of a real chain: a reorg on cue, a token symbol containing a NUL byte, a database that disappears mid-write. The chain is deterministic, so the same run twice gives the same answer, and no API token or network access is involved.

Every tool writes to a PostgreSQL container built to one definition — same image, same settings, same commands used to break it — since "what happens when the database goes away" only compares across tools if it is the same kind of database going away in the same way. Each tool gets its own instance, so tools can be measured at the same time without one scenario's outage reaching another. Verdicts are reached by reading every row back and comparing it against the chain as it finally stands, in both directions: rows that should be there and are not, and rows that are there and belong to no block on the canonical chain.

An exit the tool was not asked to make is counted as a crash, published beside the verdict with the last error it logged, and followed by a restart so the run continues. Only tools that can be pointed at an arbitrary RPC endpoint can be covered; ones reading their own data network are published as a row of dashes carrying that reason.

[The scenarios, and what each one is looking for →](./reliability/README.md)
