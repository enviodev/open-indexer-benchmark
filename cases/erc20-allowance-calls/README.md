# External Contract Calls

Logs do not hold everything an indexer needs. Sooner or later a handler has to
go and ask something — a contract, a price feed, an API — and wait for the
answer. This scenario is about what happens while it waits.

Index every `Approval` on the eight busiest ERC-20s on Ethereum Mainnet, and for
each one that is not a revocation, read the allowance the token now reports for
that owner and spender, at the block the approval was in. 15,703 of the 19,125
approvals in the range need a call, and every call takes 200ms.

The 200ms is not up to the indexer: the benchmark serves the calls itself, at a
fixed latency, identically for every tool. How many of them are outstanding at
any moment *is* up to the indexer, and that is the whole measurement. The
endpoint neither rate limits nor queues — hand it ten thousand calls at once and
ten thousand are in flight, all answered 200ms later — so a tool is never
waiting on anything but its own scheduling.

The difference is not subtle. An indexer that hands the endpoint a whole batch
at a time gets through the range in seconds. One that waits for each call before
starting the next pays 15,703 × 200ms — the better part of an hour — for the same
work, and the five-minute cap stops it long before that.

## Benchmark Specification

- **Target Contracts**: the eight ERC-20s with the most approval traffic in the
  range — USDT, USDC, XAUt, WETH, USDe, WBTC, DAI and crvUSD
- **Events Indexed**: `Approval`
- **Block Range**: 25,600,000 to latest
- **Verification Range**: 25,600,000 to 25,601,199 — indexed to completion, then
  checked against `expected.json`
- **Contract calls**: `allowance(owner, spender)`, at the event's block, for
  every approval with a non-zero value — 15,703 of the range's 19,125 approvals,
  or 14,114 once identical calls in the same block are collapsed. 200ms each,
  with no limit on how many may be outstanding
- **Features**: `event decoding`, `external calls`, `storage write`,
  `storage update on conflict`

## Case Logic

For each **Approval** event:

1. If the approved value is zero the approval was revoked, and a revoked
   allowance is zero whatever the token reports — record zero, and make no call.
2. Otherwise call `allowance(owner, spender)` on the token that emitted the log,
   **at the block the log was in**, and take the result as the allowance.
3. Insert an approval event record with the token, owner, spender, the value
   from the log, the allowance from the call, and the timestamp.
4. Upsert the allowance record keyed by (token, owner, spender) to the allowance
   from the call.

Two entities come out of it: 19,125 approval events, and 7,342 allowances —
one per distinct (token, owner, spender) triple, holding the value from the last
approval that touched it.

### Why the allowance is read rather than taken from the log

For a token that follows the standard, the log's value *is* the new allowance,
and this step would be redundant. The case does it anyway, and the reason it is
worth doing is what the step stands in for: `transferFrom` spends an allowance
without emitting anything, tokens exist whose `approve` does not store what the
log says, and any indexer maintaining a live allowance table ends up reading
some of them back. Substituting a real enrichment call — a price at a block, a
pool's reserves, an NFT's metadata URI — changes nothing about what is measured
here.

## Where the calls come from

`eth_call` is not served by the endpoint the rest of the benchmark reads from
([HyperRPC](https://docs.envio.dev/docs/HyperRPC/overview-hyperrpc)), and a real
archive node would answer the same call in a different number of milliseconds
every time it was asked. Either way the scenario would be measuring the node
rather than the indexer.

So the benchmark answers the calls itself. Every tool is pointed at a local
JSON-RPC endpoint ([`cases/lib/rpc-mock.ts`](../lib/rpc-mock.ts)) which:

- **holds every intercepted call for 200ms**, so waiting is visible and equal;
- **imposes nothing else** — no rate limit, no concurrency ceiling, no queue.
  Whatever arrives together is served together, so the peak number of calls in
  flight is a property of the indexer rather than of a wall it ran into. (The
  practical ceiling is the open-file limit, since a call in flight is a socket;
  raise `ulimit -n` before concluding a tool stopped scaling on its own.)
- **answers from the call's own arguments**, `sha256(token, owner, spender,
  block)` truncated to 64 bits, which is what makes the run reproducible. The
  value is in no log, so an indexer's rows can only match the ground truth if it
  really made the call, at the right block, and stored what came back;
- **refuses anything else** — a call to another contract, another function, or
  at the chain head — as a JSON-RPC error, so a tool cannot get a faster row by
  making different calls than everyone else. In particular, `multicall`
  aggregates are refused: this case is about scheduling calls, not about
  collapsing them;
- **accepts JSON-RPC batches**, and serves every call in one concurrently, each
  held for its own 200ms and counted separately. Batching is a transport
  decision, not an aggregation: it changes how many HTTP requests carry the
  calls, not how many calls there are or what each one costs;
- **relays every other JSON-RPC method upstream**, so logs and blocks still come
  from the real endpoint.

A call may name its block as a hex number or in either EIP-1898 form
(`{blockNumber}`, `{blockHash}`). Graph Node uses the hash form, so the endpoint
resolves a hash to its number upstream — once per block, cached, and alongside
the wait rather than after it, so the latency a tool sees is the same either
way.

The run log reports what the endpoint served for each phase, including the peak
number of calls in flight. For most rows that figure explains the rate on its
own: the work is 15,703 × 200ms of waiting, and the only variable is how much of
it happened concurrently.

### The client matters as much as the scheduling

An indexer that issues its whole batch at once still has to get those calls onto
the wire, and past a few thousand at a time that is where its run goes. A call
in flight is a socket, and opening one costs about a millisecond — against a
round trip of two hundred. Measured against this endpoint, one Node process
asking for the range's 14,114 calls:

| how the calls are sent | time |
| --- | --- |
| one HTTP request each, all at once (node's `fetch` default) | 17.6s |
| one each, over a pool of 250 kept-alive connections | 12.6s |
| one each, over a pool of 1,000 | 4.5s |
| merged into JSON-RPC batches of 1,000 | 1.6s |

The floor set by the latency alone is under a second, so the top of that table
is almost entirely the client. Every implementation here that can be told to
batch is told to batch, and the three that cannot are noted below — which is
part of what the scenario reports: a tool's contract-call throughput is its
transport's as much as its scheduler's, in this benchmark and in production
alike.

## Implementations

- **Envio** — [envio/](./envio/)
- **Ponder** — [ponder/](./ponder/)
- **Rindexer** — [rindexer/](./rindexer/)
- **Squid SDK** — [sqd/](./sqd/), benchmarked once per source it reads from
- **Subgraph** — [subgraph/](./subgraph/) (requires Docker)
- **SubQuery** — [subquery/](./subquery/) (requires Docker)

## Running the Benchmark

Requires Node 23.6+, Docker, a Rust toolchain (for the rindexer implementation),
an [Envio](https://envio.dev) API token for the log data and ground truth, and
an [SQD](https://portal.sqd.dev) API key (`SQD_API_KEY`) for the Squid SDK's
SQD Network run.

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-allowance-calls/run.ts
```

The endpoint that serves the contract calls is started by the runner on
`127.0.0.1:19878` and shut down when the run ends; nothing has to be started
separately.

Each indexer indexes the verification range to completion — its database is then
checked against `expected.json` and measured — before re-running for the
throughput window. Indexers too slow to finish the range within that window skip
it and report their rate from the verification run.

The verification run is capped at five minutes. An indexer that has not finished
by then is stopped there and verified on what it did index, so its row carries a
rate, a `~` storage figure scaled from the share of the range it covered, and a
note naming the share of the data it is missing rather than no result at all.

The throughput window defaults to 100 seconds. Pass a custom duration (in
seconds) with `--duration`:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-allowance-calls/run.ts --duration=100
```

Run a specific indexer:

```bash
ENVIO_API_TOKEN=your-token node cases/erc20-allowance-calls/run.ts envio ponder
```

### Ground truth

`expected.json` holds a row count and a checksum per entity. Regenerate it after
changing the range, the token list, or the case logic:

```bash
ENVIO_API_TOKEN=your-token node scripts/generate-expected.ts erc20-allowance-calls
```

The endpoint that answers the calls and the ground truth compute the allowance
from the same function in `case.config.ts`, so neither can drift from the other.

The endpoint itself is covered by `node scripts/test-rpc-mock.ts`, which needs no
credentials.

## Implementation Notes

Progress and correctness are both read straight from each indexer's PostgreSQL
database, never through its GraphQL API — see the
[state aggregation case](../erc20-account-balances/README.md#implementation-notes)
for why, and for the shared driver behaviour these implementations inherit.

### Why eight tokens rather than every approval on the chain

ERC-721's `Approval(address,address,uint256)` hashes to the same topic0 as
ERC-20's, with the third argument indexed instead of sitting in the data. About
one Approval log in fourteen on mainnet is therefore an NFT approval that
decodes under a different layout, and each tool's decoder handles that
differently — some skip it, some fail. That is a finding about event decoding,
and it would sit in the middle of a measurement about contract calls. Naming
eight contracts keeps the event stream homogeneous; at roughly 16 approvals a
block they are dense enough that the case is call-bound, which is the point.

### The one call per approval rule

Each allowance read is its own `eth_call`. No implementation batches them into a
`multicall` aggregate — the endpoint refuses those — because a case where the
answer is "put them all in one round trip" measures whether the implementation
knows that trick rather than what the indexer does with calls it cannot avoid.
Plenty of real enrichment calls cannot be aggregated: they hit different chains,
different providers, or an HTTP API.

Deduplicating identical calls is fair game, and several tools do it on their own:
the same (token, owner, spender) pair approving twice in one block is one call,
not two, because the answer cannot differ. 1,589 of the range's 15,703 calls
collapse this way for tools that memoize.

### Envio

Uses the [Effect API](https://docs.envio.dev/docs/HyperIndex/effect-api):
`createEffect` wraps the `eth_call` — made through a viem client with request
batching on — and the handler awaits it through `context.effect`. That is what makes the case work under HyperIndex V3's preload
optimization — handlers run once across the whole batch with writes suppressed,
where every effect in the batch is in flight at once, then again in block order
with the results already in hand. An ordinary `fetch` in the handler would run
in both passes, and serially in the second.

Effects deduplicate identical inputs, so a pair that approves twice in one block
costs one call — 14,114 of the range's 15,703. `rateLimit` is off, since the
endpoint imposes none either; against a real provider that option is where its
limit would go.

Handlers see at most 5,000 events per batch
(`envio_processing_max_batch_size`), so the range's calls go out in four
batchfuls rather than all at once — which is why the peak in flight the endpoint
reports for it is a few thousand rather than all 14,114. Envio's own metrics, on port 9898, are the
quickest way to see where a run's time went: `envio_preload_seconds` is the
phase the calls happen in, against `envio_processing_seconds` for the handlers'
second pass and `envio_storage_write_seconds` for the writes.

### Ponder

Uses `context.client.readContract`, which reads at the event's block by default.
Ponder profiles what each indexing function asks for and prefetches those reads
for upcoming events, so the calls overlap even though indexing functions run one
event at a time; results are also cached in the database, though nothing carries
over between phases here, since the driver recreates the database each time.

The chain is configured with a viem transport rather than a bare URL so those
reads are batched like the others', but unlike the others it changes little:
what Ponder prefetches is about twenty calls at a time, and twenty calls cost
about the same in one request as in twenty. Its rate here is set by how deep the
prefetching goes, not by how the calls travel.

### Rindexer

A `rust` project rather than the `no-code` setup: `no-code` describes table
operations declaratively and has no way to call a contract from a handler at
all.

The handler gets the whole batch, so the allowance reads are issued together
against the provider rindexer already maintains, rather than one after another —
but through a bounded window (2,000 in flight) rather than all at once. Its
provider helper sends one request per call and takes no batching option, so
unlike the JS implementations this one pays a connection per call. The
distinction matters in the throughput phase: there the batch is not a few
thousand events but a hundred thousand blocks' worth, and a batch that only
finishes when its very last call does writes nothing for minutes.

`rindexer codegen` generates an insert into the event table it derives from the
ABI, which has columns for the event's arguments and nothing else — no column
for an allowance that is not in the log. The case's two tables are therefore
created and written by the handler, and codegen's own insert is dropped rather
than kept alongside them, which would have made rindexer the only implementation
writing every event twice. Column types match what rindexer picks for the same
Solidity types, so the two tables look like the ones it generates.

### Squid SDK

The processor hands the handler a batch of blocks, so the handler decodes the
whole batch first and then issues every allowance read together. Reading inside
the decode loop would put one 200ms round trip between each approval and the
next.

They go through `RpcClient.batchCall`, which merges them into JSON-RPC batches
of up to a thousand, rather than the generated contract binding, which sends one
HTTP request per read. Same calls at the same blocks, a couple of dozen requests
instead of thousands.

The Squid SDK is benchmarked once per source it reads chain data from, and this
case gives the RPC endpoint to both: the allowance reads have to go somewhere
even when the events come from SQD Network.

Reading from SQD Network requires an API key as of 19 May 2026. Set
`SQD_API_KEY` (from [portal.sqd.dev](https://portal.sqd.dev)); without it that
run fails with `CREDENTIALS_INVALID` and indexes nothing. The RPC-source run
needs no key.

### Subgraph

Graph Node's mappings are single-threaded and their `eth_call`s are synchronous,
so the manifest declares the call instead:

```yaml
calls:
  allowance: ERC20[event.address].allowance(event.params.owner, event.params.spender)
```

A declared call is fetched before the handler runs, and a block's declared calls
are fetched in parallel, so the mapping's own `allowance` call is answered from
what was already prefetched. The declaration is unconditional — the manifest has
no way to say "only when the value is non-zero" — so the roughly one approval in
five that revokes is prefetched anyway and the answer thrown away.

A data source takes one address, so the eight tokens are eight data sources over
the same mapping, ABI and entities.

### SubQuery

Calls through `api`, the provider SubQuery hands the mapping, with the block tag
pinned to the event's block. Handlers run one event at a time within a worker,
so the parallelism available to it is the worker count (`--workers=4`, matching
the CI runner's cores) rather than anything the mapping can do.

The node runs with `--unsafe`. SubQuery's sandbox allows mappings to import only
`assert`, `buffer`, `crypto`, `util` and `path`, and the contract read reaches
ethers' HTTP transport, which wants node's `http`: without the flag every event
fails with `Cannot find module 'http'` and the indexer records nothing at all.
It is SubQuery's own documented escape hatch for projects that need more than
the whitelist, and it is what this case needs to run at all.

It is also the only indexer here that runs inside a container, so it reaches the
benchmark's endpoint through `host.docker.internal`, which its compose file maps
to the host gateway.
