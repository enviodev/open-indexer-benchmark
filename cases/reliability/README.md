# Reliability Scenarios

The throughput tables answer one question: how fast. These answer the other one
— what happens when something goes wrong. A database restarts under the
indexer, the chain rewrites six blocks it had already stored, a provider starts
answering 429 to everything, a token's `symbol()` returns no data at all. None
of that is exotic; all of it is a Tuesday. What differs between tools is whether
it costs throughput, costs data, or costs someone their evening.

## How these scenarios are run

Every scenario runs against a chain the benchmark makes up
([`cases/lib/chain-mock.ts`](../lib/chain-mock.ts)) rather than a real network,
for the reason that makes the scores mean anything: a nine-block reorg, a node
that stalls for exactly thirty seconds, and a log index of `0xffffffe2` cannot
be arranged on a real chain on demand, and could never be arranged twice the
same way. The mock chain does all three on request, identically, every run. The
blocks, their logs and their hashes are derived from the block number and the
branch it sits on, so a replacement block after a reorg is genuinely a different
block carrying different data — which is what makes "did the tool roll back?" a
question with an observable answer.

The indexer under test is otherwise run exactly as the throughput scenarios run
it: the tool's own production command, its own database, no benchmark-specific
configuration. What the harness does is start the chain, provoke it, and read
the tool's tables directly.

**What this cannot tell you.** A mocked chain is an RPC endpoint, so every tool
is measured on its RPC ingestion path. A tool that reads its own network in
production may behave differently there, and nothing here claims otherwise —
the source column says which path was measured, the same way it does for
throughput.

## How a score is put together

Each check below is worth the points it names, and every scenario's checks add
up to 100. A scenario's score is the share of its points earned; a column's
score is the share earned across the scenarios in it; the overall score is the
mean of the columns.

Columns are averaged rather than pooled, so that writing four more reorg checks
does not quietly demote crash recovery for every tool. The columns are meant to
be equal questions and the arithmetic says so.

A check the run could not put — the tool exited before the scenario reached it,
the case does not apply — is scored as neither pass nor fail: it leaves the
fraction entirely, so a score is always over what was actually asked. A column
where nothing could be measured publishes a dash, never a zero. "Not measured"
and "measured, scored nothing" are opposite findings and the table keeps them
apart.

Points are not spread evenly on purpose. Losing data is not the same finding as
taking longer to notice, so a check about rows that are wrong is worth more than
one about seconds spent recovering — and both are published, because an operator
choosing a tool cares about each.

## The scenarios

- [**crash recovery**](#crash-recovery) — What happens when the indexer, or the database under it, is killed and comes back.
  - [The database goes away](#db-restart)
  - [The indexer is killed mid-batch](#process-kill)
  - [The indexer is asked to stop](#graceful-shutdown)
- [**reorgs**](#reorgs) — Whether the data still matches the chain after the chain rewrites itself, in the awkward ways it really does.
  - [The chain rewrites itself](#reorg-cases)
- [**rpc faults**](#rpc-faults) — Whether a node that errors, stalls, rate limits or contradicts itself costs throughput or costs data.
  - [The node stops answering](#rpc-outage)
  - [The node refuses the question](#rpc-limits)
  - [The node contradicts itself](#rpc-inconsistency)
- [**data fidelity**](#data-fidelity) — Whether values that are unusual but entirely legal — an empty symbol, a log index near the 32-bit ceiling — are stored, refused, or fatal.
  - [Legal values that break things](#awkward-values)
- [**head latency**](#head-latency) — How long after a block is published its rows are readable, and whether that holds up while the chain misbehaves.
  - [From block to row](#block-to-row)

<a id="crash-recovery"></a>

## Crash recovery

What happens when the indexer, or the database under it, is killed and comes back.

3 scenarios, each scored out of 100 points; the column is the share earned across all of them.

<a id="db-restart"></a>

### The database goes away

Postgres restarts. It happens for maintenance, for a failover, for an OOM kill, and it happens without warning to the process connected to it. What separates tools here is not whether they notice — everyone notices — but what they do next: reconnect and carry on, or exit and wait for a human. An indexer that needs a human is an indexer that is down until someone is awake.

**What the harness does.** The tool indexes a fixed range from the mock chain. A third of the way in, its Postgres container is stopped for ten seconds and started again. The tool is left alone: nothing restarts it, and whatever it does next is the measurement. Once the range is finished — by the tool, or by the harness restarting it after it gave up — the data is checked against ground truth. The whole thing is then repeated with the tool tracking the head rather than backfilling, because a tool holding a batch of head blocks in memory has more to lose than one that can simply re-fetch.

| check | points | what a pass means |
| --- | --- | --- |
| survives a database restart mid-backfill | 30 | The indexer process is still running two minutes after Postgres comes back, and its progress has moved since. A tool that exited scores nothing here, whatever it does on the next launch. |
| survives a database restart at the head | 20 | The same, while tracking the head. Separate from the backfill check because the two are different code paths in most tools, and because at the head a lost in-flight batch is data an indexer will not naturally come back for. |
| loses nothing across the restart | 30 | Once the range is complete — restarting the tool by hand if it will not restart itself — every row matches ground truth. This is scored separately from survival because the two failures are unrelated: a tool can crash and recover perfectly, and a tool can stay up while quietly skipping the batch it was mid-write on. |
| writes no duplicates across the restart | 20 | The other half of the same question. A batch retried after a failed commit must not land twice: the row count matches ground truth exactly, and no aggregate — a balance, a running total — has been applied more than once. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| restarts needed *(shown in the results table)* | count | How many times the harness had to start the indexer again for it to finish the range. Zero is a tool that recovered on its own. This is reported rather than scored because the score already says the tool did not survive; what an operator wants to know next is how often they would have been paged. |
| time to resume | s | Seconds from Postgres accepting connections again to the tool's progress moving again. A tool with a long fixed backoff is not broken, but it is minutes behind by the time it notices, and at the head that is the whole story. |

<a id="process-kill"></a>

### The indexer is killed mid-batch

A deploy, an OOM, a node draining — the process disappears without getting to finish what it was writing. Restart correctness is the property that decides whether that is a non-event or a silent corruption, and it is close to unobservable from the outside: a tool that resumes two blocks early looks exactly like one that resumed correctly, until an aggregate is compared against ground truth.

**What the harness does.** The tool indexes a fixed range and is sent SIGKILL — no chance to flush, no shutdown hook — partway through, then started again against the same database with no other change. This is done at three different moments, one of them chosen to land while a batch is being committed. The final data is compared against ground truth, and the tool's own progress marker against where it actually resumed from.

| check | points | what a pass means |
| --- | --- | --- |
| resumes without being told to | 25 | The restarted process continues from its own recorded position rather than starting over or refusing to start. A tool that re-indexes the range from scratch passes this check — it is correct, just expensive — and the cost shows up as re-indexed blocks in the measures below. |
| leaves no gap at the kill point | 30 | Every event in the range is present afterwards. The blocks around the kill are the ones to watch: a tool that advances its checkpoint before the rows it covers are durable loses exactly the batch it was holding, and nothing later will go back for it. |
| applies nothing twice | 30 | Aggregated entities match ground truth exactly. This is where a checkpoint that is behind the data bites: replaying blocks that were already written is harmless for an insert and wrong for a balance, and only a scenario that kills the process mid-commit will show it. |
| never exposes a half-written batch | 15 | The database is read immediately after the kill, before the restart. Either the batch is entirely there or entirely absent — a partial batch visible to a reader means anything querying the indexer during a crash gets an inconsistent answer. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| blocks re-indexed | blocks | How far back the tool resumed from, past the last block it had written. Small is efficient, zero is suspicious, and large means every deploy costs real time. |

<a id="graceful-shutdown"></a>

### The indexer is asked to stop

The ordinary case, and the one most likely to be assumed rather than tested: SIGTERM, the signal every orchestrator sends before it kills. A tool that treats it as an abort is doing the crash path on every deploy — which is fine if the crash path is sound, and a slow leak of duplicated aggregates if it is not.

**What the harness does.** The tool is sent SIGTERM while indexing, and given fifteen seconds. What it does with them, its exit code, and the state it leaves behind are recorded, then it is restarted and the range finished.

| check | points | what a pass means |
| --- | --- | --- |
| exits cleanly within fifteen seconds | 40 | The process exits zero without needing SIGKILL. A tool that ignores SIGTERM entirely is killed by its orchestrator every time, so its real shutdown path is the crash path above. |
| leaves its checkpoint consistent with its data | 60 | After the clean stop, the tool's own recorded position and the rows in the database agree: nothing is written past the checkpoint and nothing the checkpoint covers is missing. This is what makes the next start correct. |

<a id="reorgs"></a>

## Reorgs

Whether the data still matches the chain after the chain rewrites itself, in the awkward ways it really does.

One scenario, scored out of 100 points.

<a id="reorg-cases"></a>

### The chain rewrites itself

Every indexer claims to handle reorgs, and a one-block reorg where an event's value changes is genuinely easy. The cases that separate tools are the ones that are hard to arrange on a real chain and therefore rarely tested: a reorg that removes an event rather than changing it, a reorg deeper than the tool's unfinalised window, a reorg that happens while the tool is offline, and a second reorg arriving while the first is still being unwound. Each is one check below, because a tool can pass any of them and fail the rest.

**What the harness does.** The tool tracks the head of the mock chain while the chain is rewritten to order. Each case rewrites a stated depth, either replacing the events in those blocks with different ones or dropping them entirely, and then the chain is advanced past the rewrite and left alone until the tool has caught up. The data is compared against the chain as it finally stands — the check is not that the tool noticed, it is that what it holds is what is on the chain.

| check | points | what a pass means |
| --- | --- | --- |
| a one-block reorg that changes an event | 10 | The head block is replaced with one carrying different transfer amounts. Afterwards the stored amounts are the new ones. The baseline case: a tool that fails here has no reorg handling at all. |
| a reorg that removes an event entirely | 20 | The replacement blocks carry no logs. The rows for the discarded events must be gone, and any aggregate they contributed to must be back to what it was. This is the case an upsert-shaped rollback fails silently: writing the new state over the old works when there is new state, and does nothing at all when the event simply stopped existing. |
| a reorg deeper than the unfinalised window | 20 | Sixty blocks are rewritten — past the depth most tools keep rollback information for. Handling it correctly is one thing; the check is that the tool either handles it or stops and says so. Carrying on with data it can no longer reconcile is the failing outcome, and it is the common one. |
| a reorg that happens while the indexer is down | 20 | The tool is stopped, the chain is rewritten beneath it, and it is started again. Nothing announced the reorg — the tool has to notice that the block it last recorded is no longer on the chain, by checking the hash rather than the height. A tool that resumes from its stored block number without verifying it continues from a fork that no longer exists. |
| reorgs arriving faster than they can be unwound | 15 | Three reorgs in twelve seconds, the second landing while the first is still being rolled back. The end state has to match the chain. This is where reorg handling that assumes it runs to completion — a rollback that is not itself atomic — leaves a mixture of two branches. |
| a reorg touching blocks still being backfilled | 15 | The chain is rewritten at a height the tool has already indexed but has not yet caught up to, so the reorg is behind the head it is working towards. A tool that only checks for reorgs at the head walks straight past it. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| time to reconcile | s | Seconds from the chain being rewritten to the database matching it again, averaged over the cases the tool got right. A tool that is correct in a minute and one that is correct in ten seconds both pass; an operator serving queries off the database cares which. |

<a id="rpc-faults"></a>

## Rpc faults

Whether a node that errors, stalls, rate limits or contradicts itself costs throughput or costs data.

3 scenarios, each scored out of 100 points; the column is the share earned across all of them.

<a id="rpc-outage"></a>

### The node stops answering

Providers rate limit, time out, return 502s from a load balancer, and occasionally accept a request and never answer it. None of that is exceptional and all of it is temporary, so the only acceptable response is to retry and carry on. The failure modes worth finding are the two extremes: a tool that exits on the first error, and a tool that retries so eagerly it is indistinguishable from an attack on the provider that is already struggling.

**What the harness does.** While the tool indexes, the mock chain is made to fail in four ways in turn, thirty seconds each: JSON-RPC errors, HTTP 429 with a rate-limit body, HTTP 502, and accepting requests without ever answering them. The endpoint counts what arrives during each, so a retry policy can be seen rather than assumed. Then it heals, and the range is finished and verified.

| check | points | what a pass means |
| --- | --- | --- |
| survives every fault without exiting | 35 | The process is still running after all four windows. The stall is the one that catches tools out: an error comes back and can be reacted to, while a request that is simply never answered needs a client-side timeout to exist at all. |
| resumes promptly once the node recovers | 25 | Progress moves again within thirty seconds of the endpoint healing. A tool that backed off exponentially without a ceiling is technically fine and practically down. |
| loses nothing to a failed request | 30 | The finished range matches ground truth. A range whose request failed has to be retried, not skipped — and a tool that treats an error body as an empty result set records the blocks it never read as blocks that held nothing. |
| backs off rather than hammering | 10 | Requests during a fault window stay under twenty times the tool's own healthy rate. Not a correctness property, but the difference between a provider that recovers and one that stays down because every indexer pointed at it is retrying in a tight loop. |

<a id="rpc-limits"></a>

### The node refuses the question

Public endpoints cap what one request may ask for: a block range, a number of results, a response size. The caps differ per provider and are discovered by hitting them. A tool that splits its query and carries on is portable across providers; a tool that does not is pinned to whichever endpoint it was developed against.

**What the harness does.** The mock chain enforces a thousand-block ceiling on `eth_getLogs` and refuses any response over ten thousand logs, with the error strings the common providers use. The tool is pointed at it with no configuration hinting at either limit, and the endpoint records the widest range it was asked for.

| check | points | what a pass means |
| --- | --- | --- |
| narrows its range when one is refused | 50 | The tool finishes the range, having retried with a smaller one rather than stopping. Configuring the limit up front is not a pass: the point is what happens against a provider whose caps were not known in advance. |
| narrows when the result set is too large | 30 | The same for the result-count cap, which needs a different response — a narrower range for the same span — and is the one more often left unhandled. |
| widens again once it can | 20 | After a refused range, the tool does not spend the rest of the run at its smallest range. Scored because the alternative — collapsing to single-block queries forever after one refusal — turns a transient limit into a permanent throughput cost. |

<a id="rpc-inconsistency"></a>

### The node contradicts itself

The failure nobody plans for, because it should not happen and does: a load-balanced endpoint answering from two nodes at different heights, so the head goes backwards; a block hash that was valid a second ago and is not now; the same block served twice. A tool that trusts the endpoint's answers unconditionally will happily record any of it.

**What the harness does.** The chain is made to answer from behind for a while — a head lower than one already reported — and to serve a block range twice in succession, and a hash the tool has already used is reorged out from under a request in flight.

| check | points | what a pass means |
| --- | --- | --- |
| tolerates a head that moves backwards | 40 | The tool neither crashes nor rewinds its own data on the strength of one lagging answer, and carries on once the head recovers. Treating a lagging replica as a reorg is a real and expensive false positive. |
| ignores a block range delivered twice | 30 | The same logs arriving a second time produce no second row and no doubled aggregate. Idempotent ingestion, tested by asking for it rather than hoping. |
| handles a block hash that stops existing | 30 | A request against a hash the chain has reorged away comes back an error, not an empty result. The tool has to treat that as a reorg signal; treating it as a failed request and retrying forever is the stall this check finds. |

<a id="data-fidelity"></a>

## Data fidelity

Whether values that are unusual but entirely legal — an empty symbol, a log index near the 32-bit ceiling — are stored, refused, or fatal.

One scenario, scored out of 100 points.

<a id="awkward-values"></a>

### Legal values that break things

Chain data is not the tidy subset a schema was designed around. A token's `symbol()` returns nothing at all; a string field holds a byte Postgres will not store in a text column; a provider emits a log index near the top of an unsigned 32-bit integer. None of these are corrupt data and all of them have stopped an indexer dead — the last one is exactly what ponder-sh/ponder#2373 was opened about. Every check here is a value that must land in the database as itself, or be refused loudly, but never take the process down.

**What the harness does.** The mock chain serves a token whose metadata calls answer awkwardly and blocks whose logs carry awkward values, and the case's handlers read that metadata and store it. The database is then read directly: the check is what is in the column, not what the tool logged.

| check | points | what a pass means |
| --- | --- | --- |
| an empty symbol() is stored as null | 25 | `symbol()` returns `0x` — no data, which is what a token that does not implement it does. The row must exist with a null symbol. Decoding empty returndata as an empty string is acceptable; crashing, skipping the row, or storing the literal text "undefined" is not. |
| a NUL byte in a string does not kill the write | 20 | A symbol containing `\u0000`, which is legal in a Solidity string and which Postgres will not accept in a `text` column. Either the tool sanitises it or it fails that row explicitly; what it must not do is fail the whole batch forever and stall the indexer behind one token. |
| a log index near the 32-bit ceiling | 25 | Logs with index `0xffffffe2`, as some providers emit for synthetic logs. Storing it in a signed 32-bit column overflows and halts the backfill outright — the failure reported in ponder-sh/ponder#2373. The check is that the range finishes and the index round-trips. |
| an unsigned 256-bit maximum survives the round trip | 20 | A transfer of 2^256-1. The stored value must equal it exactly. Anything that goes through a double loses precision quietly, which is worse than failing. |
| long empty stretches advance progress | 10 | Five hundred blocks with no logs at all. The tool's progress must move through them: a tool that tracks position only by the last row it wrote appears to be stuck, and stops answering how far along it is. |

<a id="head-latency"></a>

## Head latency

How long after a block is published its rows are readable, and whether that holds up while the chain misbehaves.

One scenario, scored out of 100 points.

<a id="block-to-row"></a>

### From block to row

Backfill throughput says how long a tool takes to catch up once. Head latency says what it is like to live with afterwards: the gap between a block being published and its rows being readable is the staleness of everything built on the indexer. It is a distribution rather than a number — the median is the ordinary experience, and the tail is the one that shows up as a bug report.

**What the harness does.** The mock chain publishes a block every two seconds for five minutes, stamping the wall clock as each becomes the head. The harness polls the tool's own tables and records when each block's rows first become readable. The difference is the latency; the distribution is reported rather than an average, because a tool that batches every thirty seconds and one that writes continuously can share a mean while feeling nothing alike. The last minute repeats the exercise across a reorg, since that is when staleness costs the most.

| check | points | what a pass means |
| --- | --- | --- |
| median latency inside one block time | 35 | Half of all blocks are readable within two seconds of being published. This is the property that lets an application read the indexer instead of the chain. |
| the slowest one percent stays under ten seconds | 30 | The tail matters more than the median for anything user-facing. A tool that flushes on a timer has a tail the length of its timer, whatever its median says. |
| never falls behind the chain | 20 | The gap between the chain head and the tool's position never exceeds five blocks for more than fifteen seconds. A tool that cannot keep up with a two-second block time at the head is only ever catching up. |
| returns to its normal latency after a reorg | 15 | Within thirty seconds of a reorg being reconciled, latency is back in the band it held before. Reorg handling that pauses ingestion for a minute is a correctness win and an availability cost, and both belong in the record. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| median latency *(shown in the results table)* | ms | Median milliseconds from a block being published to its rows being readable. This is the number published in the table's head lag column. |
| 99th percentile latency | ms | The tail, over the same run. |
| worst lag behind the head | blocks | The largest gap seen between the chain head and the tool's position. |

---

_This page is generated from [`cases/lib/reliability/scenarios.ts`](../lib/reliability/scenarios.ts)
by `node scripts/build-reliability-doc.ts`. Edit the catalog, not this file: it is the same
source the scores are computed from, so what a check is worth and what it means cannot drift apart._
