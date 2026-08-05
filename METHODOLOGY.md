# Methodology

Each scenario runs twice. Once over a fixed block range, to check the indexer's data against ground truth and measure it on disk. Once as a timed window, to measure how fast it goes. Everything runs in GitHub CI on `ubuntu-latest`, one job per tool per source, each started the way that tool's own documentation recommends for production.

What the result table columns mean:

**events/s, blocks/s** — measured over a 100-second window that stops short of the chain head, so it is backfill speed rather than head tracking. The window runs twice and the better rate is reported. A tool too slow to get through the fixed range in that time reports the rate it managed there instead.

**data** — ✅ every row matches ground truth, ❌ it does not, ❓ only part of the range got indexed, or the check could not run. Ground truth is built by replaying each scenario's documented logic over [HyperSync](https://docs.envio.dev/docs/HyperSync/overview) logs. Anything but ✅ carries a numbered note under the table.

**storage** — the scenario's own tables and indexes, excluding each tool's internal bookkeeping. A `~` means the tool covered part of the range and the figure is scaled up from what it did index.

**source** — where the tool reads chain data. A tool is benchmarked once per source it supports, so a fast tool on a slow source is not mistaken for a slow tool. SQD reads the SQD network; tools without their own pipeline read [Envio HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc).

**contract calls** — a scenario whose handlers read contract state does not read it from a real node. The benchmark answers those calls itself, at a fixed latency and a fixed number in flight, from the call's own arguments — so every tool waits exactly as long for exactly the same answers, and what the scenario measures is how much of that ceiling each one keeps in use. Any other call is refused rather than answered, and the answers appear in no log, so a matching checksum is proof the calls were really made.

The verification run is capped at ten minutes. An indexer that has not finished by then is stopped there and verified on what it indexed, so it still gets a rate and a note saying how much data is missing.

Each scenario's own page documents its block range, contracts, entities and per-tool implementation notes.
