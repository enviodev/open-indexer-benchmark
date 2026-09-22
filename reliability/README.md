# Reliability Scenarios

The throughput tables answer one question: how fast. These answer the other one
- what happens when something goes wrong. A database restarts under the
indexer, the chain rewrites six blocks it had already stored, a provider starts
answering 429 to everything, a token's `symbol()` returns no data at all. None
of that is exotic; all of it is a Tuesday. What differs between tools is whether
it costs throughput, costs data, or costs someone their evening.

## How these scenarios are run

Every scenario runs against a chain the benchmark makes up
([`reliability/lib/chain-mock.ts`](./lib/chain-mock.ts)) rather than a real network,
for the reason that makes the scores mean anything: a nine-block reorg, a node
that stalls for exactly thirty seconds, and a log index of `0xffffffe2` cannot
be arranged on a real chain on demand, and could never be arranged twice the
same way. The mock chain does all three on request, identically, every run. The
blocks, their logs and their hashes are derived from the block number and the
branch it sits on, so a replacement block after a reorg is genuinely a different
block carrying different data - which is what makes "did the tool roll back?" a
question with an observable answer.

The indexer under test is otherwise run exactly as the throughput scenarios run
it: the tool's own production command, its own database, no benchmark-specific
configuration. Each tool implements the same small project - a transfer per
log, a running balance, and one row written from a contract read - under
[`reliability/`](.), started by the same drivers the throughput suite uses.
What the harness does is start the chain, provoke it, and read the tool's
tables directly.

One thing the harness does start: HyperIndex connects to a Postgres it expects
to be running already, where every other tool brings its own up. Both Envio
rows would otherwise index nothing, so the suite starts one on that port before
running them, and leaves alone whatever is already there.

**Every scenario runs more than once**, three times by default, against a fresh
chain and a fresh database each time, and a check passes only if it passed
every run. This is not noise reduction. A measurement is allowed to be noisy; a
check is a claim that a tool does something, and one that holds two times in
three is not a weaker claim but a worse one - an indexer that survives a
database restart unless the restart lands mid-batch has not survived it. A
check that failed once in three is published as a failure, with the count in
the note. The measures beside the scores are measurements, so those are the
median of the runs, and the spread is printed in the run log.

**What this cannot tell you.** A mocked chain is an RPC endpoint, so every tool
is measured on its RPC ingestion path. A tool that reads its own network in
production may behave differently there, and nothing here claims otherwise -
the source column says which path was measured, the same way it does for
throughput.

### Why a generated chain, and not a real node

[Anvil](https://getfoundry.sh/anvil/overview) can reorg on demand -
`anvil_reorg` rewinds by a depth and mines replacement blocks - and it would
be a better chain than this one in every respect that is about being a chain:
real receipts, real hashes, real ordering, a real ERC-20 to read. It was the
first option considered, and it is the obvious way to run the reorg and head
latency scenarios if this ever outgrows a generated chain.

It is not what these scenarios use, for two reasons.

Half of what they do is not about the chain at all. A node that answers 429 for
thirty seconds, refuses a block range, serves the same log twice in one
response, or reports a head lower than the one it reported a second ago - none
of that is a chain doing something. It is a *provider* doing something, and no
real node will do any of it on request. Ten of the checks here are exactly
that.

And one of them is impossible on a real chain by construction. A log index of
`0xffffffe2` is what some providers emit for synthetic logs, and is what
[ponder-sh/ponder#2373](https://github.com/ponder-sh/ponder/pull/2373) was
opened about. A real EVM numbers logs sequentially within a block and would
need four billion of them in one.

The honest version of the alternative is a fault-injecting proxy in front of
anvil, which would get both halves - and this repository already puts a proxy
in front of a real endpoint for the contract-call scenario, so the shape is
familiar. That is a good direction and nothing here forecloses it: the tools
are pointed at a URL, and what serves it is one module.

**The cost of a generated chain, and what is done about it.** It serves the
methods someone thought to write down. An indexer reaching for another gets an
error, fails to index, and - left alone - would be published as a tool that
cannot handle reorgs, which would be this benchmark reporting its own gap as a
finding about somebody else's software. So it is not left alone: the chain
counts every method it refused, and a scenario that saw one publishes its
failures as *unmeasured*, naming the method. A gap in the benchmark shows up as
a dash and a to-do against
[`chain-mock.ts`](./lib/chain-mock.ts), never as a score.

## How a score is put together

There is nothing to it, on purpose. Every check below either passes or does
not. A cell in the results table is the passes over the asks - `4 / 6` - and
the overall column is the same sum across the whole suite.

Checks are not weighted against each other. A weighting would be an opinion
buried in the arithmetic, deciding on your behalf that losing rows is worth one
and a half times taking a minute to notice, and leaving a number nobody can
argue with. `4 / 6` is a claim about *which four*, and this page names them.

Two consequences, stated rather than corrected for. A check has to be worth
asking on its own, since each one moves the number by the same amount - a
trivial check would dilute its column. And a column with more checks pulls
harder on the overall than one with fewer, so the overall is a count of
questions answered, not a verdict weighted by importance. Read the columns.

A check the run could not put - the tool exited before the scenario reached it,
the case does not apply - is scored as neither pass nor fail. It leaves the
fraction entirely, so a score is always over what was actually asked. A column
where nothing could be measured publishes a dash, never `0 / n`: "not
measured" and "measured, passed nothing" are opposite findings and the table
keeps them apart.

There is no total to aim for and no passing mark. A tool that answers every
question in this file is a tool that survived the situations someone thought to
write down, which is not the same as a reliable tool - see
[what this does not measure](#not-measured) at the end.

## The scenarios

- [**crash recovery**](#crash-recovery) - What happens when the indexer, or the database under it, is killed and comes back.
  - [The database goes away](#db-restart)
  - [The indexer is killed mid-batch](#process-kill)
  - [The indexer is asked to stop](#graceful-shutdown)
- [**reorgs**](#reorgs) - Whether the data still matches the chain after the chain rewrites itself, in the awkward ways it really does.
  - [The chain rewrites itself](#reorg-cases)
- [**rpc faults**](#rpc-faults) - Whether a node that errors, stalls, rate limits or contradicts itself costs throughput or costs data.
  - [The node stops answering](#rpc-outage)
  - [Everything wrong at once](#rpc-chaos)
  - [The node refuses the question](#rpc-limits)
  - [The node contradicts itself](#rpc-inconsistency)
- [**data fidelity**](#data-fidelity) - Whether values that are unusual but entirely legal - an empty symbol, a log index near the 32-bit ceiling - are stored, refused, or fatal.
  - [Legal values that break things](#awkward-values)
- [**head latency**](#head-latency) - How long after a block is published its rows are readable, and whether that holds up while the chain misbehaves.
  - [From block to row](#block-to-row)

<a id="coverage"></a>

## Which tools are measured

| tool | source | status |
| --- | --- | --- |
| Envio Indexer | RPC | measured |
| Envio Subgraph | RPC | measured |
| Ponder | RPC | measured |
| Rindexer | RPC | measured |
| Squid SDK | RPC | measured |
| Subgraph | RPC | measured |
| SubQuery | RPC | measured |
| Envio Indexer | HyperSync | reads HyperSync, which the benchmark cannot make reorg or fail on demand; the Envio Indexer's RPC row is measured instead |
| Envio Subgraph | HyperSync | reads HyperSync, which the benchmark cannot make reorg or fail on demand; the Envio Subgraph's RPC row is measured instead |
| Rindexer | HyperSync | reads HyperSync, which the benchmark cannot make reorg or fail on demand; Rindexer's RPC row is measured instead |
| Squid SDK | SQD Network | reads SQD Network, which the benchmark cannot make reorg or fail on demand; the Squid SDK's RPC row is measured instead |
| Substreams | StreamingFast | reads a StreamingFast endpoint rather than plain RPC, which the benchmark cannot make reorg or fail on demand |
| Carbon | RPC | indexes Solana, and the generated chain is an Ethereum node; provoking a Solana indexer needs a Solana chain to provoke |

A tool needs two things to appear in the results: an RPC path the generated
chain can serve, and an implementation of the case above for its framework.
Any row marked *not yet* is waiting only on the second, and adding one is the
whole of what it takes - the drivers, the scenarios, the scoring and the table
are already common to every tool.

A project that cannot implement one of the three entities loses the checks
that read it, and nothing else: they come back unmeasured, so that column's
denominator is smaller rather than its numerator being lower. One row is in
that position today. A no-code rindexer project is its yaml, which describes
events and the tables they write and has no facility for reading contract
state, so it writes no token row and the two metadata checks cannot be put to
it. Writing those two would mean a rust rindexer project instead, which is
what the External Contract Calls scenario uses for the same reason.

<a id="crash-recovery"></a>

## Crash recovery

What happens when the indexer, or the database under it, is killed and comes back.

3 scenarios, 11 checks between them; the column counts all of them together.

<a id="db-restart"></a>

### The database goes away

Postgres restarts. It happens for maintenance, for a failover, for an OOM kill, and it happens without warning to the process connected to it. What separates tools here is not whether they notice - everyone notices - but what they do next: reconnect and carry on, or exit and wait for a human. An indexer that needs a human is an indexer that is down until someone is awake.

**What the harness does.** The tool indexes a fixed range from the mock chain. A third of the way in, its Postgres container is stopped for ten seconds and started again. The tool is left alone: nothing restarts it, and whatever it does next is the measurement. Once the range is finished - by the tool, or by the harness restarting it after it gave up - the data is checked against ground truth. The whole thing is then repeated with the tool tracking the head rather than backfilling, because a tool holding a batch of head blocks in memory has more to lose than one that can simply re-fetch. Finally the container is frozen rather than stopped, for twenty seconds, which leaves its connections open and answers nothing on them.

| check | what a pass means |
| --- | --- |
| indexes again after a database restart mid-backfill | Progress has moved since Postgres came back - on its own, or after the harness started the tool again. Exiting is a real cost and it is published beside this score as "restarts needed" rather than counted twice: a tool that comes back and gets the data right recovered, however ungracefully, and the checks below are what say whether the data is right. What fails here is the tool that indexes nothing more, restart or no restart. |
| follows the head again after a database restart | The same, while tracking the head. Separate from the backfill check because the two are different code paths in most tools, and because at the head a lost in-flight batch is data an indexer will not naturally come back for. |
| notices when a frozen database thaws | The database is frozen rather than stopped - SIGSTOP, so the connections stay open and no query is ever answered - and the tool starts indexing again by itself once it is thawed. This is the one outage where needing a restart is the finding rather than a cost: nothing crashed, no error was raised, and every health check still answers, so nothing tells anybody there is something to restart. A tool with a statement timeout comes back on its own; one without waits in the silence until somebody notices the data is an hour old. |
| loses nothing across the restart | Once the range is complete - restarting the tool by hand if it will not restart itself - every row matches ground truth. This is scored separately from survival because the two failures are unrelated: a tool can crash and recover perfectly, and a tool can stay up while quietly skipping the batch it was mid-write on. |
| writes no duplicates across the restart | The other half of the same question. A batch retried after a failed commit must not land twice: the row count matches ground truth exactly, and no aggregate - a balance, a running total - has been applied more than once. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| restarts needed *(shown in the results table)* | count | How many times the harness had to start the indexer again for it to finish the range. Zero is a tool that recovered on its own. This is reported rather than scored because the score already says the tool did not survive; what an operator wants to know next is how often they would have been paged. |
| time to resume | s | Seconds from Postgres accepting connections again to the tool's progress moving again. A tool with a long fixed backoff is not broken, but it is minutes behind by the time it notices, and at the head that is the whole story. |

<a id="process-kill"></a>

### The indexer is killed mid-batch

A deploy, an OOM, a node draining - the process disappears without getting to finish what it was writing. Restart correctness is the property that decides whether that is a non-event or a silent corruption, and it is close to unobservable from the outside: a tool that resumes two blocks early looks exactly like one that resumed correctly, until an aggregate is compared against ground truth.

**What the harness does.** The tool indexes a fixed range and is sent SIGKILL - no chance to flush, no shutdown hook - partway through, then started again against the same database with no other change. This is done at three different moments, one of them chosen to land while a batch is being committed. The final data is compared against ground truth, and the tool's own progress marker against where it actually resumed from.

| check | what a pass means |
| --- | --- |
| resumes without being told to | The restarted process continues from its own recorded position rather than starting over or refusing to start. A tool that re-indexes the range from scratch passes this check - it is correct, just expensive - and the cost shows up as re-indexed blocks in the measures below. |
| leaves no gap at the kill point | Every event in the range is present afterwards. The blocks around the kill are the ones to watch: a tool that advances its checkpoint before the rows it covers are durable loses exactly the batch it was holding, and nothing later will go back for it. |
| applies nothing twice | Aggregated entities match ground truth exactly. This is where a checkpoint that is behind the data bites: replaying blocks that were already written is harmless for an insert and wrong for a balance, and only a scenario that kills the process mid-commit will show it. |
| never exposes a half-written batch | The database is read immediately after the kill, before the restart. Either the batch is entirely there or entirely absent - a partial batch visible to a reader means anything querying the indexer during a crash gets an inconsistent answer. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| blocks re-indexed | blocks | How far back the tool resumed from, past the last block it had written. Small is efficient, zero is suspicious, and large means every deploy costs real time. |

<a id="graceful-shutdown"></a>

### The indexer is asked to stop

The ordinary case, and the one most likely to be assumed rather than tested: SIGTERM, the signal every orchestrator sends before it kills. A tool that treats it as an abort is doing the crash path on every deploy - which is fine if the crash path is sound, and a slow leak of duplicated aggregates if it is not.

**What the harness does.** The tool is sent SIGTERM while indexing, and given fifteen seconds. What it does with them, its exit code, and the state it leaves behind are recorded, then it is restarted and the range finished.

| check | what a pass means |
| --- | --- |
| exits cleanly within fifteen seconds | The process exits zero without needing SIGKILL. A tool that ignores SIGTERM entirely is killed by its orchestrator every time, so its real shutdown path is the crash path above. |
| leaves correct data behind when it stops | What is in the database after the stop matches the chain: no duplicated rows, no amounts that were never on the chain, no balances left half-applied. This is the state the next start reads and builds on, so whatever is wrong here is wrong from then on - a restart continues from it rather than rechecking it, and the error is still there weeks later with nothing in any log to say where it came from. |

<a id="reorgs"></a>

## Reorgs

Whether the data still matches the chain after the chain rewrites itself, in the awkward ways it really does.

One scenario, 7 checks.

<a id="reorg-cases"></a>

### The chain rewrites itself

Every indexer claims to handle reorgs, and a one-block reorg where an event's value changes is genuinely easy. The cases that separate tools are the ones that are hard to arrange on a real chain and therefore rarely tested: a reorg that removes an event rather than changing it, a reorg deeper than the tool's unfinalised window, a reorg that happens while the tool is offline, and a second reorg arriving while the first is still being unwound. Each is one check below, because a tool can pass any of them and fail the rest.

**What the harness does.** The tool tracks the head of the mock chain while the chain is rewritten to order. Each case rewrites a stated depth, either replacing the events in those blocks with different ones or dropping them entirely, and then the chain is advanced past the rewrite and left alone until the tool has caught up. The data is compared against the chain as it finally stands - the check is not that the tool noticed, it is that what it holds is what is on the chain.

| check | what a pass means |
| --- | --- |
| a one-block reorg that changes an event | The head block is replaced with one carrying different transfer amounts. Afterwards the stored amounts are the new ones. The baseline case: a tool that fails here has no reorg handling at all. |
| a fork that leaves the chain shorter | Six blocks are replaced by three, so the canonical chain is shorter than the one the tool has already stored and its head has to move backwards. An indexer that only ever moves forward - overwriting each block as it reads it, never deleting - handles every other reorg on this page and silently keeps three blocks' worth of rows that are on no chain at all. |
| a reorg that removes an event entirely | The replacement blocks carry no logs. The rows for the discarded events must be gone, and any aggregate they contributed to must be back to what it was. This is the case an upsert-shaped rollback fails silently: writing the new state over the old works when there is new state, and does nothing at all when the event simply stopped existing. |
| a reorg deeper than the unfinalised window | Eighty blocks are rewritten - past the unfinalised window of every tool here, Ponder's sixty-five being the deepest. Handling it correctly is one thing; the check is that the tool either handles it or stops and says so. Carrying on with data it can no longer reconcile is the failing outcome, and it is the common one. The depth is not arbitrary: at sixty this check was inside Ponder's rollback window, so the question it exists to ask was never put to the tool most likely to fail it. |
| a reorg that happens while the indexer is down | The tool is stopped, the chain is rewritten beneath it, and it is started again. Nothing announced the reorg - the tool has to notice that the block it last recorded is no longer on the chain, by checking the hash rather than the height. A tool that resumes from its stored block number without verifying it continues from a fork that no longer exists. |
| reorgs arriving faster than they can be unwound | Three reorgs in twelve seconds, the second landing while the first is still being rolled back. The end state has to match the chain. This is where reorg handling that assumes it runs to completion - a rollback that is not itself atomic - leaves a mixture of two branches. |
| a reorg touching blocks still being backfilled | The chain is rewritten at a height the tool has already indexed but has not yet caught up to, so the reorg is behind the head it is working towards. A tool that only checks for reorgs at the head walks straight past it. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| time to reconcile | s | Seconds from the chain being rewritten to the database matching it again, averaged over the cases the tool got right. A tool that is correct in a minute and one that is correct in ten seconds both pass; an operator serving queries off the database cares which. |

<a id="rpc-faults"></a>

## Rpc faults

Whether a node that errors, stalls, rate limits or contradicts itself costs throughput or costs data.

4 scenarios, 15 checks between them; the column counts all of them together.

<a id="rpc-outage"></a>

### The node stops answering

Providers rate limit, time out, return 502s from a load balancer, and occasionally accept a request and never answer it. None of that is exceptional and all of it is temporary, so the only acceptable response is to retry and carry on. The failure modes worth finding are the two extremes: a tool that exits on the first error, and a tool that retries so eagerly it is indistinguishable from an attack on the provider that is already struggling.

**What the harness does.** While the tool indexes, the mock chain is made to fail in four ways in turn, thirty seconds each: JSON-RPC errors, HTTP 429 with a rate-limit body, HTTP 502, and accepting requests without ever answering them. The endpoint counts what arrives during each, so a retry policy can be seen rather than assumed. Then it heals, and the range is finished and verified.

| check | what a pass means |
| --- | --- |
| survives every fault without exiting | The process is still running after all four windows. The stall is the one that catches tools out: an error comes back and can be reacted to, while a request that is simply never answered needs a client-side timeout to exist at all. |
| resumes promptly once the node recovers | Progress moves again within the scenario's patience of the endpoint healing. A tool that backed off exponentially without a ceiling is technically fine and practically down; how long it took is reported as a measure rather than judged at an arbitrary cut. |
| loses nothing to a failed request | The finished range matches ground truth. A range whose request failed has to be retried, not skipped - and a tool that treats an error body as an empty result set records the blocks it never read as blocks that held nothing. |
| backs off rather than hammering | Requests during a fault window stay under twenty times the tool's own healthy rate. Not a correctness property, but the difference between a provider that recovers and one that stays down because every indexer pointed at it is retrying in a tight loop. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| time to resume | s | Seconds from the endpoint answering again to the tool's progress moving again. This is where a backoff with no ceiling shows up: the tool is not broken, it is just not looking yet. |

<a id="rpc-chaos"></a>

### Everything wrong at once

A provider having a bad hour does not fail every request and then stop. It fails one in ten, in several different ways, while an indexer is in the middle of a backfill - and the retry paths that each work on their own start interacting. This is the scenario that finds an indexer finishing its range hundreds of rows short without ever exiting, logging an error, or noticing.

**What the harness does.** For two minutes, one request in eight is broken while the chain keeps producing. The way it breaks changes every ten seconds, through JSON-RPC errors, HTTP 429, HTTP 502, a truncated body, a dropped socket, a block wrongly answered as missing, and getLogs requests that are never answered. The dice are seeded, so a run that finds something can be run again. Then the endpoint is left alone and the tool is given the scenario's full patience to finish the range, which is compared against ground truth.

| check | what a pass means |
| --- | --- |
| stays up through a bad hour | The process is still running after two minutes of mixed faults. Every one of them is a condition a provider really produces, none of them lasts, and a tool that exits has turned a provider's bad hour into an outage of its own. |
| finishes the range once the endpoint is healthy | The tool reaches the head within the scenario's patience after the faults stop. A tool whose backoff has no ceiling, or that is still retrying a request the endpoint dropped, is indistinguishable from one that is down. |
| loses nothing to the faults | Every row the chain holds is in the database. This is the check the scenario exists for: a truncated body and a null block are both answers a careless client reads as "nothing there", and a tool that advances its cursor past them finishes looking finished, with holes nothing will come back for. |
| writes nothing twice while retrying | No row appears twice and no balance is off. The mirror of the check above: a request that fails after the node has served it is retried, and a tool that applies what comes back without checking what it already has doubles exactly the range it retried. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| requests broken | count | How many requests the endpoint broke during the scenario. Reported so a row that passed can be read as "passed with this much thrown at it" rather than "passed", since the count depends on how hard the tool was working at the time. |

<a id="rpc-limits"></a>

### The node refuses the question

Public endpoints cap what one request may ask for: a block range, a number of results, a response size. The caps differ per provider and are discovered by hitting them. A tool that splits its query and carries on is portable across providers; a tool that does not is pinned to whichever endpoint it was developed against.

**What the harness does.** The mock chain enforces a thousand-block ceiling on `eth_getLogs` and refuses any response over ten thousand logs, with the error strings the common providers use. The tool is pointed at it with no configuration hinting at either limit, and the endpoint records the widest range it was asked for.

| check | what a pass means |
| --- | --- |
| narrows its range when one is refused | The tool finishes the range, having retried with a smaller one rather than stopping. Configuring the limit up front is not a pass: the point is what happens against a provider whose caps were not known in advance. |
| narrows when the result set is too large | The same for the result-count cap, which needs a different response - a narrower range for the same span - and is the one more often left unhandled. |
| widens again once it can | After a refused range, the tool does not spend the rest of the run at its smallest range. Scored because the alternative - collapsing to single-block queries forever after one refusal - turns a transient limit into a permanent throughput cost. |

<a id="rpc-inconsistency"></a>

### The node contradicts itself

The failure nobody plans for, because it should not happen and does: a load-balanced endpoint answering from two nodes at different heights, so the head goes backwards; a block hash that was valid a second ago and is not now; the same block served twice. A tool that trusts the endpoint's answers unconditionally will happily record any of it.

**What the harness does.** The chain is made to answer from behind for a while - a head lower than one already reported - and to serve a block range twice in succession, and a hash the tool has already used is reorged out from under a request in flight.

| check | what a pass means |
| --- | --- |
| tolerates a head that moves backwards | The tool neither crashes nor rewinds its own data on the strength of one lagging answer, and carries on once the head recovers. Treating a lagging replica as a reorg is a real and expensive false positive. |
| ignores a block range delivered twice | The same logs arriving a second time produce no second row and no doubled aggregate. Idempotent ingestion, tested by asking for it rather than hoping. |
| gets past a block the endpoint says is not there | Half the block lookups answer null for blocks the chain holds, for twenty seconds, while the logs in them are still served. This is not a rare condition: an endpoint behind a load balancer announces a head from one machine and is asked for it from another that is a second behind, and the honest answer that machine has is null. A tool that reads null as "no such block" and moves its cursor past it has a hole in its data that nothing will come back for; a tool that treats it as fatal is down for something that fixes itself. |
| handles a block hash that stops existing | A request against a hash the chain has reorged away comes back an error, not an empty result. The tool has to treat that as a reorg signal; treating it as a failed request and retrying forever is the stall this check finds. |

<a id="data-fidelity"></a>

## Data fidelity

Whether values that are unusual but entirely legal - an empty symbol, a log index near the 32-bit ceiling - are stored, refused, or fatal.

One scenario, 6 checks.

<a id="awkward-values"></a>

### Legal values that break things

Chain data is not the tidy subset a schema was designed around. A token's `symbol()` returns nothing at all; a string field holds a byte Postgres will not store in a text column; a provider emits a log index near the top of an unsigned 32-bit integer. None of these are corrupt data and all of them have stopped an indexer dead - the last one is exactly what ponder-sh/ponder#2373 was opened about. Every check here is a value that must land in the database as itself, or be refused loudly, but never take the process down.

**What the harness does.** The mock chain serves a token whose metadata calls answer awkwardly and blocks whose logs carry awkward values, and the case's handlers read that metadata and store it. The database is then read directly: the check is what is in the column, not what the tool logged.

| check | what a pass means |
| --- | --- |
| an empty symbol() is stored as null | `symbol()` returns `0x` - no data, which is what a token that does not implement it does. The row must exist with a null symbol. Decoding empty returndata as an empty string is acceptable; crashing, skipping the row, or storing the literal text "undefined" is not. |
| a NUL byte in a string does not kill the write | A symbol containing `\u0000`, which is legal in a Solidity string and which Postgres will not accept in a `text` column. Either the tool sanitises it or it fails that row explicitly; what it must not do is fail the whole batch forever and stall the indexer behind one token. |
| indexes both of the events it is configured for | Every project in this suite handles two events - the transfers everything else here is about, and a MetadataUpdated the chain emits every twenty-five blocks - and both are stored. A tool that indexes the event it was written around and ignores the other passes every other check on this page, because every other check reads transfers. It is not a hypothetical failure: an earlier revision of this benchmark caught a no-code project doing exactly this, silently, with no error anywhere. |
| a log index near the 32-bit ceiling | Logs with index `0xffffffe2`, as some providers emit for synthetic logs. Storing it in a signed 32-bit column overflows and halts the backfill outright - the failure reported in ponder-sh/ponder#2373. The check is that the range finishes and the index round-trips. |
| an unsigned 256-bit maximum survives the round trip | A transfer of 2^256-1. The stored value must equal it exactly. Anything that goes through a double loses precision quietly, which is worse than failing. |
| long empty stretches advance progress | Five hundred blocks with no logs at all. The tool has to come out the other side: either its own position moves through them, or it holds rows from beyond them. A tool that does neither has stalled on a stretch of chain that asked nothing of it. Both answers count because the benchmark reads position from the rows written for two of these tools, which is the harness's choice rather than theirs. |

<a id="head-latency"></a>

## Head latency

How long after a block is published its rows are readable, and whether that holds up while the chain misbehaves.

One scenario, 4 checks.

<a id="block-to-row"></a>

### From block to row

Backfill throughput says how long a tool takes to catch up once. Head latency says what it is like to live with afterwards: the gap between a block being published and its rows being readable is the staleness of everything built on the indexer. It is a distribution rather than a number - the median is the ordinary experience, and the tail is the one that shows up as a bug report.

**What the harness does.** The mock chain publishes a block every two seconds for five minutes, stamping the wall clock as each becomes the head. The harness polls the tool's own tables and records when each block's rows first become readable. The difference is the latency; the distribution is reported rather than an average, because a tool that batches every thirty seconds and one that writes continuously can share a mean while feeling nothing alike. The last minute repeats the exercise across a reorg, since that is when staleness costs the most.

| check | what a pass means |
| --- | --- |
| median latency inside one block time | Half of all blocks are readable within two seconds of being published. This is the property that lets an application read the indexer instead of the chain. |
| the slowest one percent stays under ten seconds | The tail matters more than the median for anything user-facing. A tool that flushes on a timer has a tail the length of its timer, whatever its median says. |
| never falls behind the chain | The gap between the chain head and the tool's position never exceeds five blocks for more than fifteen seconds. A tool that cannot keep up with a two-second block time at the head is only ever catching up. |
| returns to its normal latency after a reorg | Within thirty seconds of a reorg being reconciled, latency is back in the band it held before. Reorg handling that pauses ingestion for a minute is a correctness win and an availability cost, and both belong in the record. |

Reported alongside the score, and not part of it:

| measure | unit | what it says |
| --- | --- | --- |
| median latency *(shown in the results table)* | ms | Median milliseconds from a block being published to its rows being readable. This is the number published in the table's head lag column. |
| 99th percentile latency | ms | The tail, over the same run. |
| worst lag behind the head | blocks | The largest gap seen between the chain head and the tool's position. |

<a id="not-measured"></a>

## What this does not measure

Everything above is a situation someone thought to write down. These are the
ones already identified as fair game and not yet built - published here rather
than left in an issue tracker, because a tool that passes every check above has
passed every check above, and that is a smaller claim than "reliable".

Suggestions are welcome, and so are pull requests: adding one is a matter of
moving its entry up into [`reliability/lib/scenarios.ts`](./lib/scenarios.ts)
and teaching the harness to provoke it.

| candidate | column it would join | why it matters | what it would take |
| --- | --- | --- | --- |
| Determinism across two identical runs | data fidelity | A tool that processes several block ranges at once can produce different aggregates on two runs over the same range, and nothing about a single run reveals it. It surfaces later as a database that disagrees with a rebuild of itself, which is the hardest class of bug to argue about with a vendor. | Index the same fixed range twice from a clean database and compare the two checksums. Costs a second run per tool and nothing else; this is the cheapest candidate on the list. |
| A handler that throws | crash recovery | User code fails - a bad decode, a null where one was not expected, a division by zero on an empty pool. What the tool does then is a design decision that is rarely documented and never the same twice: retry the event, skip it, stop the indexer, or write the row without it. Each is defensible; silently skipping is the one that loses data without saying so. | Serve a block whose log decodes to a value the case's handler divides by, and watch what reaches the database and what reaches the exit code. |
| Backpressure when the database is slow | crash recovery | A database under load does not fail, it slows down. An indexer that keeps fetching regardless grows its in-memory queue until the process is killed, and the crash then looks like an OOM with no cause. An indexer that throttles gets slower and stays up. | Put a proxy in front of Postgres that adds a hundred milliseconds to every statement, index at the head, and record resident memory. The check is that memory stays bounded, not that throughput holds. |
| Crash-loop on poison state | crash recovery | The worst outage shape there is: a tool that crashes on something in its own database, restarts, reads it again, and crashes again, forever, with no way through short of wiping and re-indexing. | Combine two checks the suite already has - the NUL byte in a string, and the process kill - so the tool restarts into the row it died on, then count restarts before progress moves. |
| Reading the indexer while it is reorging | reorgs | Correct data eventually is not the same as correct data throughout. An application querying an indexer mid-rollback can see a state that was never on the chain - the old rows deleted and the new ones not yet written - which is a consistency claim most tools have never had to make out loud. | Poll the tool's own API, not its tables, across a reorg, and check that every response is a state the chain actually held. |
| Schema change on restart | a new column | The everyday operation nobody scores: a column is added and the tool is restarted against a database written by the previous schema. Refusing to start is a fine answer, re-indexing from scratch is a fine answer, and quietly serving a mixture of the two shapes is not. | Index a range, change the schema, restart, and record which of the three happens. Needs a second schema per tool, which is why it is a candidate rather than a scenario. |
| Multi-chain skew | a new column | Most production indexers read more than one chain, and the interesting failure is one chain stalling: does the other keep going, or does a shared checkpoint hold it back until both are stuck? | Serve two mock chains and stall one. Cheap to arrange, and needs a second network in every tool's project - the reason it is not in the first cut. |
| Disk exhaustion | a new column | Postgres out of space is a distinct failure from Postgres gone: writes fail while reads succeed, indefinitely, and a tool that treats it as a transient error retries forever without saying anything useful. | Cap the database volume and index past it. Harder to make deterministic than the rest of the list, since what fails first depends on the tool's write pattern. |

---

_This page is generated from [`reliability/lib/scenarios.ts`](./lib/scenarios.ts)
by `node scripts/build-reliability-doc.ts`. Edit the catalog, not this file: it is the same
source the scores are computed from, so what a check is worth and what it means cannot drift apart._
