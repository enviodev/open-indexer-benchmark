# Reliability

The throughput scenarios ask how fast an indexer is when everything works. These
ask what it does when things do not: the database is restarted under it, the
chain reorganises twelve blocks deep, the endpoint starts returning 500s, the
process is killed mid-write, or a contract emits a byte PostgreSQL cannot store.

Every result here comes from a chain this repository generates in-process. That
is the point. A reorg cannot be requested from Ethereum, a token will not emit a
NUL byte on cue, and two tools measured against the live head are never shown
the same chain. So the chain is synthetic, deterministic, and driven directly by
the scenario — no API token, no network, and the same run twice gives the same
answer.

```bash
node reliability/run.ts                                  # every tool, every scenario
node reliability/run.ts ponder envio                     # two tools
node reliability/run.ts --scenarios=reorg,db-outage      # two scenarios
node reliability/run.ts ponder --keep-db                 # leave the rows to look at
node reliability/run.ts --jobs=1                         # one tool at a time
node scripts/test-reliability.ts                         # check the harness itself
```

Docker is required — PostgreSQL runs in a container, because half these
scenarios work by taking that container away. Nothing else is needed: no API
token and no network.

Tools run concurrently and each tool's scenarios run one after another. Nothing
reads a real data source, so there is no shared endpoint to contend for; each
tool gets its own generated chain, its own endpoint port and its own database
container. Two scenarios of the *same* tool cannot overlap — they would write
the same project directory and bind the same ports — which is why the lane is
per tool. CI goes further and gives every (tool, scenario) pair its own runner.

The timings still depend on what else is on the machine, so `--jobs=1` is the
local option when a latency or resume figure is the point; CI is the
measurement of record.


## How a run is put together

**The chain** (`lib/chain.ts`) is a list of blocks whose contents are derived
from the block height *and* its epoch — how many times that height has been
rewritten. A reorg replaces a block with one carrying genuinely different
transfers, so a row left behind from an orphaned block is not merely stale: it
is a value that exists nowhere on the canonical chain, which is exactly what an
application would read and act on. Orphaned blocks stay retrievable by hash, the
way a real node serves them after a reorg, so a tool that unwinds correctly is
not penalised for it.

**The endpoint** (`lib/rpc-server.ts`) is ordinary Ethereum JSON-RPC over HTTP,
answering as chain 1 so that every tool's normal mainnet configuration applies
unchanged — including whatever confirmation depth it assumes, which is part of
what the reorg scenario measures. It serves batch requests, `finalized` and
`safe` tags, real log blooms, and refuses an oversized `eth_getLogs` range the
way a public provider does. It also has a fault switch a scenario can turn on
and off mid-run.

**The database** (`lib/postgres.ts`) is a PostgreSQL container defined in one
place and created identically for every tool — same image, same settings, same
commands used to break it. The throughput benchmark lets each tool bring its
own; here what matters is that they are alike, because "what happens when the
database goes away" only compares across tools if it is the same kind of
database going away in the same manner. Each tool gets its own instance, so one
scenario stopping a container cannot stop it under a tool being measured
alongside.

**The indexers** are ordinary projects, one per tool, in this directory. They
index the same two events into the same two entities, keyed by `(block number,
log index)` so that a row means the same thing in every tool's database. The
handlers do no aggregation and no defensive validation — what is being measured
is the tool, not how carefully the handler was written.

**Crashes are always counted.** An exit the harness did not ask for is recorded,
the tool is restarted, and the run continues — a crash is a cost, not an end to
the run. The count and the last error the tool logged are published next to the
verdict, because "crashed 3 times" invites a guess and the guess is usually
wrong.


## The scenarios

### Restart recovery

The indexer is SIGKILLed four times — after its first writes, twice inside a
burst of 400 blocks released in one go, and once at the head with blocks still
arriving while the process is dead — and then stopped gracefully.

SIGKILL rather than SIGTERM, because a graceful shutdown tests the shutdown path
and not the recovery path. What is being checked is the invariant that makes a
crash safe: progress must only ever be committed together with the rows it
accounts for. A tool that commits progress first loses whatever was in flight
and never looks for it again; a tool that commits rows first re-processes them
and duplicates them. Both look identical while running.

How far behind a tool actually is when the knife falls depends on how fast it
is, and there is no fair way to hold every tool to the same lag — so the
position at the moment of the kill is measured and published rather than
assumed. "Killed at block 137 of 460" says what was tested; "killed
mid-backfill" only says what was intended.

Reported: whether it came back and caught up, how long that took, how many
blocks it had to re-read, and whether the final data has any gaps or
duplicates.

### Database outage

PostgreSQL is stopped, SIGKILLed and paused under the running indexer, four
times, while the chain keeps producing blocks.

Three shapes, because tools fail differently under each. `docker stop` is a
clean shutdown — connections close and a client that handles errors at all sees
a definite one. `docker kill` is SIGKILL, so PostgreSQL replays its WAL on the
way back and any transaction in flight is gone whether or not the client
noticed. `docker pause` is SIGSTOP: the connections stay open and stop
answering, so a tool without timeouts hangs rather than erroring. That last one
finds the tools whose retry logic never gets a chance to run.

Reported: how many of the four outages it survived, how many restarts it needed,
how long it took to get back to the head after each, and whether the final data
is correct.

### Reorg handling

Seven shapes, applied in sequence, with the whole table compared against the
canonical chain after each one:

| case | what it is |
| --- | --- |
| tip | the head block is replaced. The easy case; everyone handles it |
| 3 deep | the unwind has to walk back more than one block |
| 12 deep | deep enough that a fixed-size buffer of recent blocks may not cover it |
| shortening | six blocks replaced by three, so the head moves *backwards*. A tool tracking "highest block seen" never notices |
| repeated | three reorgs 600ms apart, arriving before the unwind from the last one has finished |
| during backfill | the tool is put 80 blocks behind, then blocks it has not read yet are rewritten. A tool that only compares hashes at the tip has nothing to compare |
| beyond finality | deeper than the finality the endpoint promised. Reported, but a failure here costs a ⚠️ rather than a ❌ — no tool promises to survive an endpoint breaking its own guarantee |

After each reorg the chain keeps producing — ten more blocks, one every 700ms —
before anything is checked. A real chain does not stop dead the instant it
reorganises, and the difference decides the result: a tool that re-checks block
hashes as new blocks arrive needs new blocks to arrive.

A case is judged on the problems it introduced, not on problems an earlier case
left behind, so one mishandled reorg does not fail every case after it.

Reported: which shapes were handled, how long convergence took, and for each
failure whether rows were kept from orphaned blocks, rows of the new chain were
missing, or both.

### Hostile values

One block emits a token symbol containing a NUL byte, a name containing an
emoji, a tab and a newline, and a transfer of 2²⁵⁶−1.

The NUL is the headline. PostgreSQL cannot store one in a `text` column — its
wire protocol terminates strings on it — so an indexer meets a value it must not
drop and cannot write, in the middle of its own write path. Contracts do emit
them, sometimes from a fixed-size buffer copied wholesale.

There is no perfect answer and this scenario does not pretend otherwise. It asks
two things instead. Did the tool keep going — a crash loop on one log stops every
contract that tool indexes, at that block, until a human intervenes. And did it
say anything: storing the value with the NUL stripped is fine, storing it
escaped is fine, skipping the row and logging it is defensible, and skipping it
silently is the one outcome an operator cannot recover from.

Reported: whether it got past the block, exactly what ended up stored, and
whether the uint256 survived a column that may not have been wide enough.

### Head latency

The time from a block reaching the chain head to its rows being readable in
PostgreSQL, measured over twenty blocks produced two seconds apart.

Almost nobody publishes this number and it is the one an application feels: a
user makes a trade and then looks at a page. Backfill throughput says nothing
about it — at the head the cost is the polling interval, the confirmation depth,
and how long the write path waits before committing a batch. Each tool is run
with its own defaults, so a tool that polls every second is measured polling
every second; that is a property of the tool, and one you can change.

The harness records the wall-clock moment each block became the head, then polls
the database every 100ms until the rows are readable. Figures are reported to a
tenth of a second because the polling is the resolution.

Reported: median, p95 and maximum, and any block that never showed up.

### Flaky RPC

The endpoint returns 25% HTTP 500s, 10% 429s, 10% JSON-RPC errors, added
latency, and — the interesting one — a 5% chance of answering `null` for a block
it announced a moment ago, the way a load-balanced provider does when a request
lands on a replica that has not caught up. Then thirty seconds of truncated
response bodies and dropped sockets, which get past a client that only checks
the HTTP status. Then the faults are switched off.

Reported: whether the tool caught up on its own once the endpoint was healthy,
how long that took, how many faults it rode out, and how many times it died
first.


## What the results mean

| | |
| --- | --- |
| ✅ | the scenario's checks all passed, and the tool never had to be restarted |
| ⚠️ | correct in the end, but it cost something — restarts, a value stored lossily, a case only a promise-breaking endpoint could cause |
| ❌ | the data was wrong at the end, or the tool never recovered |
| ❓ | the run could not be measured. A job that failed, not a tool that did |

Every non-✅ cell carries a numbered note under the table saying what happened.
The per-scenario tables carry the numbers behind the glyph.


## Which tools are covered

Any tool that can be pointed at an arbitrary JSON-RPC endpoint: Envio, Ponder,
rindexer, Subgraph (Graph Node) and SubQuery.

Envio and Sqd are also benchmarked on their own data pipelines in the throughput
scenarios, and those pipelines cannot be shown a chain that only exists inside
this process. Envio is therefore run here with RPC as its sync source — the same
indexer, the same write path, reorg handling and restart recovery, reading from
somewhere else. Sqd reads the SQD network and has no RPC sync mode, so it is
published as a row of dashes with that reason attached rather than left out.


## Adding a tool

1. Create `reliability/<tool>/` — an ordinary project for that indexer, writing
   the two entities in `lib/entities.ts`, keyed by `(block number, log index)`.
   Configuration that cannot be read from the environment goes in a
   `*.template.*` file; the driver materialises it per run, because most
   scenarios have no end block at all.
2. Add a driver in `lib/drivers/`. It must resume on `launch()` rather than
   resetting — every launch after the first is a recovery from a crash — and it
   must point the tool at the shared PostgreSQL rather than starting its own.
3. Register it in `lib/drivers/index.ts`.

`node scripts/test-reliability.ts` covers the harness. The first real check of a
new tool is `node reliability/run.ts <tool> --scenarios=restart-recovery`.


## Adding a scenario

A scenario is a file in `lib/scenarios/` exporting a `Scenario`: how the chain
should be shaped, what to do to it, and what "correct" means afterwards. The
harness gives it the chain, the endpoint, the database and the process, and
counts crashes whether it asks or not. Register it in `lib/scenarios/index.ts`
and add a matrix entry in `.github/workflows/reliability.yml`.

Ideas that are not built yet, roughly in order of how often they bite in
production: a disk filling up under the database; a chain that stalls for
minutes and then jumps forward a hundred blocks; block timestamps that go
backwards; an endpoint that silently serves a *different* chain after a
failover; two instances of the same indexer pointed at one database; and a soak
run long enough for a slow leak to show.
