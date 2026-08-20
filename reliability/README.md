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

Two blocks carry values a tool may not want. None of them is malformed: every
one is a validly encoded thing a node will hand you.

| value | why it is hard |
| --- | --- |
| a token symbol containing a NUL byte | PostgreSQL cannot store one in a `text` column — its wire protocol terminates strings on it — so the tool meets a value it must not drop and cannot write, inside its own write path |
| a name with an emoji, a tab and a newline | ordinary text that breaks anything assembling SQL or logs by concatenation |
| a transfer of 2²⁵⁶−1 | what a uint256 column is for, and what a bigint column is not |
| a log indexed at `0xfffffffc` | some chains put indices near the uint32 ceiling on synthetic logs; this one halted a Ponder backfill in [ponder-sh/ponder#2373](https://github.com/ponder-sh/ponder/pull/2373) |

The NUL byte and the uint256 sit on one block; the large log index sits on
another, twenty blocks later. Kept apart on purpose — a tool that stopped would
otherwise leave no way to say which value stopped it.

There is no perfect answer to any of these and this scenario does not pretend
otherwise. The last one is openly contested: the pull request above was closed
on the grounds that an index that large is an RPC or chain bug rather than
something an indexer should accommodate, which is a defensible position. This
suite does not take a side. It emits the value, reports what each tool does, and
leaves the argument to the reader.

What is not a matter of opinion is the shape of the outcome, so that is what is
graded:

- **Did the tool keep going?** A hard stop or a crash loop on one log means
  every contract that tool indexes stops at that block until a human
  intervenes. That is what an operator feels regardless of whose bug it is.
  Note that a tool fetching logs a range at a time can come to rest well short
  of the offending block — Ponder stops around block 25 over a log in block 60 —
  so the block it stopped at and the block that stopped it are both reported.
- **Did it say anything?** Storing the value with the NUL stripped is fine.
  Storing it escaped is fine. Skipping the row and logging it is defensible.
  Skipping it silently is the one outcome an operator cannot recover from.

The entity schemas here all use a 64-bit column for the log index. That is
deliberate: an `int4` in this repository's own schema would reject the log
before the indexer's limits ever came into it, and the scenario would be
measuring these projects rather than the tools.

Reported: whether it got past each block, exactly what ended up stored, and —
when a tool stalls without exiting — the last error it logged, since a silent
stall otherwise reads as a mystery rather than a finding.

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

The throughput benchmark measures a tool once per data source it supports. This
suite measures it once, over RPC, because RPC is the only way to serve a chain
that exists inside this process. That is not a narrower test of the tool: the
write path, the reorg unwinding and the restart recovery are the same code
whichever source fed them. So the Envio row here answers for both of the
benchmark's Envio rows, and the rindexer row for both of its rindexer rows.

What is left over is published as a row of dashes with the reason attached, and
that list is **worked out from the benchmark's own registry rather than written
down** (`lib/drivers/index.ts`). A tool whose only source is HyperSync or SQD
Network says so; a tool that could be measured here but has no driver yet says
that instead. Both beat being absent, which reads as a tool nobody thought of.

The list was hand-written once and did not survive its first merge: four
variants landed at once, two of them RPC-only, and the published note went on
claiming the Squid SDK "cannot be pointed at the mock chain" after `sqd-rpc` had
made that untrue. `scripts/test-reliability.ts` now fails if any benchmark tool
is neither covered nor explained.


## When the benchmark changes

The two suites share a repository and almost nothing else, which is deliberate —
but three kinds of change upstream do reach this one.

**A new scenario in `cases/`** needs nothing here. Reliability does not run the
benchmark's cases: it has one contract, two events and two entities of its own,
sized for chaos rather than throughput. A fourth or fifth benchmark case changes
no file in this directory.

**A new tool or variant in the benchmark registry** appears in the reliability
table by itself, on the next run, as a dashed row explaining why it is not
measured. Nothing breaks and nothing goes silently missing. Turning that row
into a measured one is the "Adding a tool" recipe below; until someone does, the
gap is visible in the published table rather than only in this file.

**A new version of a tool** does not propagate. The indexer projects here are
separate installs with their own lockfiles, so a bump in `cases/` leaves this
suite on the version it had. That is a feature while a run is in flight and a
liability afterwards — reliability results describe whatever version this
directory pins, so bump them together and say so. The pins are
`reliability/*/package.json`, `reliability/subquery/docker-compose.yml`, and,
shared with the benchmark, `GRAPH_NODE_VERSION` in
`cases/lib/drivers/subgraph.ts`.

Only two files are shared outright: `cases/lib/process.ts` for spawning and
`psql`, and the Graph Node installer, so both suites test the same binary. Both
are in this workflow's `paths:` filter, so a change to either runs the
reliability jobs too.


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
