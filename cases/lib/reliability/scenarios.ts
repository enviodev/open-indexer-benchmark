// What the reliability suite asks of an indexer, and what it has yet to ask.
//
// The performance scenarios ask one question — how fast — and the answer is a
// number the run produces on its own. Reliability has no such number. What it
// has is a list of things that go wrong in production, each of which an indexer
// either survives or does not, so the suite is written as that list: scenarios,
// each holding checks, each check a single claim that is either true of a tool
// or is not.
//
// This file is the only place that list exists. The score table's columns, the
// weights behind every published number, and the page a reader lands on when
// they follow a score all come from here, so a check cannot be scored without
// being explained, and cannot be explained differently from the way it is
// scored. Adding a scenario is adding an entry here; everything downstream —
// the detail page, the columns, the totals — follows.
//
// Every scenario runs against the chain in ../chain-mock.ts rather than a real
// network. The whole point is arranging moments that a real chain will not
// arrange on demand and will never arrange twice the same way: a nine-block
// reorg, a node that stops answering for thirty seconds, a token whose
// `symbol()` returns nothing. A made-up chain does all three on request, which
// is what makes the result a score rather than an anecdote.
//
// The cost of that is what the suite cannot say. A mocked chain is an RPC
// endpoint, so a tool is measured on its RPC path; the same tool reading its
// own network may behave differently, and nothing here claims otherwise. The
// source column says which path was measured, the same way it does for
// throughput.

/** A group of scenarios, published as one column of the reliability table. */
export interface Group {
  id: string;
  title: string;
  /** What the column means, in one sentence, for the table's own reader. */
  blurb: string;
}

export const GROUPS: Group[] = [
  {
    id: "crash-recovery",
    title: "crash recovery",
    blurb:
      "What happens when the indexer, or the database under it, is killed and comes back.",
  },
  {
    id: "reorgs",
    title: "reorgs",
    blurb:
      "Whether the data still matches the chain after the chain rewrites itself, in the awkward ways it really does.",
  },
  {
    id: "rpc-faults",
    title: "rpc faults",
    blurb:
      "Whether a node that errors, stalls, rate limits or contradicts itself costs throughput or costs data.",
  },
  {
    id: "data-fidelity",
    title: "data fidelity",
    blurb:
      "Whether values that are unusual but entirely legal — an empty symbol, a log index near the 32-bit ceiling — are stored, refused, or fatal.",
  },
  {
    id: "head-latency",
    title: "head latency",
    blurb:
      "How long after a block is published its rows are readable, and whether that holds up while the chain misbehaves.",
  },
];

/**
 * One claim about a tool that a run makes true or false.
 *
 * Checks are not weighted against each other. A weighting would be a second
 * opinion buried inside the arithmetic — someone deciding that losing rows is
 * worth twice as much as taking a minute to notice — and it would leave a
 * published number that no reader can reconstruct. Counting instead makes the
 * score exactly as strong as the list it is drawn from: "4 of 6" is a claim
 * about which four, and the page behind it names them.
 *
 * The consequence is that a check has to be worth asking on its own. A trivial
 * one dilutes the column it sits in, which is a better problem than a weight
 * nobody can argue with.
 */
export interface Check {
  id: string;
  /** Short enough for a failure note under the table. */
  label: string;
  /** What the harness does, and what counts as a pass. Becomes the detail page. */
  detail: string;
}

/**
 * A published measurement that is reported but not scored — the number a
 * reader wants after the verdict. How many times a tool had to be restarted by
 * hand is the clearest example: the score says it did not survive, and this
 * says what surviving it would have cost an operator.
 */
export interface Measure {
  id: string;
  label: string;
  unit: string;
  detail: string;
  /**
   * Publish this number in the score table itself, beside its group's score.
   * At most one per group: a cell has room for the verdict and one number, and
   * the number worth the room is the one an operator would ask for next.
   */
  headline?: boolean;
  /** Word the headline number is printed with, e.g. "2 restarts". */
  abbr?: string;
}

export interface Scenario {
  id: string;
  title: string;
  group: string;
  /** One paragraph: why this is worth a column of anyone's attention. */
  summary: string;
  /** What the harness actually does, step by step. */
  method: string;
  checks: Check[];
  measures?: Measure[];
}

export const SCENARIOS: Scenario[] = [
  // ── Crash recovery ───────────────────────────────────────────────────
  {
    id: "db-restart",
    title: "The database goes away",
    group: "crash-recovery",
    summary:
      "Postgres restarts. It happens for maintenance, for a failover, for an OOM kill, and it happens without warning to the process connected to it. What separates tools here is not whether they notice — everyone notices — but what they do next: reconnect and carry on, or exit and wait for a human. An indexer that needs a human is an indexer that is down until someone is awake.",
    method:
      "The tool indexes a fixed range from the mock chain. A third of the way in, its Postgres container is stopped for ten seconds and started again. The tool is left alone: nothing restarts it, and whatever it does next is the measurement. Once the range is finished — by the tool, or by the harness restarting it after it gave up — the data is checked against ground truth. The whole thing is then repeated with the tool tracking the head rather than backfilling, because a tool holding a batch of head blocks in memory has more to lose than one that can simply re-fetch.",
    checks: [
      {
        id: "survives-backfill",
        label: "survives a database restart mid-backfill",
        detail:
          "The indexer process is still running two minutes after Postgres comes back, and its progress has moved since. A tool that exited scores nothing here, whatever it does on the next launch.",
      },
      {
        id: "survives-head",
        label: "survives a database restart at the head",
        detail:
          "The same, while tracking the head. Separate from the backfill check because the two are different code paths in most tools, and because at the head a lost in-flight batch is data an indexer will not naturally come back for.",
      },
      {
        id: "no-loss",
        label: "loses nothing across the restart",
        detail:
          "Once the range is complete — restarting the tool by hand if it will not restart itself — every row matches ground truth. This is scored separately from survival because the two failures are unrelated: a tool can crash and recover perfectly, and a tool can stay up while quietly skipping the batch it was mid-write on.",
      },
      {
        id: "no-duplicates",
        label: "writes no duplicates across the restart",
        detail:
          "The other half of the same question. A batch retried after a failed commit must not land twice: the row count matches ground truth exactly, and no aggregate — a balance, a running total — has been applied more than once.",
      },
    ],
    measures: [
      {
        id: "manual-restarts",
        label: "restarts needed",
        unit: "count",
        headline: true,
        abbr: "restarts",
        detail:
          "How many times the harness had to start the indexer again for it to finish the range. Zero is a tool that recovered on its own. This is reported rather than scored because the score already says the tool did not survive; what an operator wants to know next is how often they would have been paged.",
      },
      {
        id: "resume-seconds",
        label: "time to resume",
        unit: "s",
        detail:
          "Seconds from Postgres accepting connections again to the tool's progress moving again. A tool with a long fixed backoff is not broken, but it is minutes behind by the time it notices, and at the head that is the whole story.",
      },
    ],
  },
  {
    id: "process-kill",
    title: "The indexer is killed mid-batch",
    group: "crash-recovery",
    summary:
      "A deploy, an OOM, a node draining — the process disappears without getting to finish what it was writing. Restart correctness is the property that decides whether that is a non-event or a silent corruption, and it is close to unobservable from the outside: a tool that resumes two blocks early looks exactly like one that resumed correctly, until an aggregate is compared against ground truth.",
    method:
      "The tool indexes a fixed range and is sent SIGKILL — no chance to flush, no shutdown hook — partway through, then started again against the same database with no other change. This is done at three different moments, one of them chosen to land while a batch is being committed. The final data is compared against ground truth, and the tool's own progress marker against where it actually resumed from.",
    checks: [
      {
        id: "resumes",
        label: "resumes without being told to",
        detail:
          "The restarted process continues from its own recorded position rather than starting over or refusing to start. A tool that re-indexes the range from scratch passes this check — it is correct, just expensive — and the cost shows up as re-indexed blocks in the measures below.",
      },
      {
        id: "no-gap",
        label: "leaves no gap at the kill point",
        detail:
          "Every event in the range is present afterwards. The blocks around the kill are the ones to watch: a tool that advances its checkpoint before the rows it covers are durable loses exactly the batch it was holding, and nothing later will go back for it.",
      },
      {
        id: "no-double-apply",
        label: "applies nothing twice",
        detail:
          "Aggregated entities match ground truth exactly. This is where a checkpoint that is behind the data bites: replaying blocks that were already written is harmless for an insert and wrong for a balance, and only a scenario that kills the process mid-commit will show it.",
      },
      {
        id: "atomic-batch",
        label: "never exposes a half-written batch",
        detail:
          "The database is read immediately after the kill, before the restart. Either the batch is entirely there or entirely absent — a partial batch visible to a reader means anything querying the indexer during a crash gets an inconsistent answer.",
      },
    ],
    measures: [
      {
        id: "reindexed-blocks",
        label: "blocks re-indexed",
        unit: "blocks",
        detail:
          "How far back the tool resumed from, past the last block it had written. Small is efficient, zero is suspicious, and large means every deploy costs real time.",
      },
    ],
  },
  {
    id: "graceful-shutdown",
    title: "The indexer is asked to stop",
    group: "crash-recovery",
    summary:
      "The ordinary case, and the one most likely to be assumed rather than tested: SIGTERM, the signal every orchestrator sends before it kills. A tool that treats it as an abort is doing the crash path on every deploy — which is fine if the crash path is sound, and a slow leak of duplicated aggregates if it is not.",
    method:
      "The tool is sent SIGTERM while indexing, and given fifteen seconds. What it does with them, its exit code, and the state it leaves behind are recorded, then it is restarted and the range finished.",
    checks: [
      {
        id: "exits-clean",
        label: "exits cleanly within fifteen seconds",
        detail:
          "The process exits zero without needing SIGKILL. A tool that ignores SIGTERM entirely is killed by its orchestrator every time, so its real shutdown path is the crash path above.",
      },
      {
        id: "flushes",
        label: "leaves its checkpoint consistent with its data",
        detail:
          "After the clean stop, the tool's own recorded position and the rows in the database agree: nothing is written past the checkpoint and nothing the checkpoint covers is missing. This is what makes the next start correct.",
      },
    ],
  },

  // ── Reorgs ───────────────────────────────────────────────────────────
  {
    id: "reorg-cases",
    title: "The chain rewrites itself",
    group: "reorgs",
    summary:
      "Every indexer claims to handle reorgs, and a one-block reorg where an event's value changes is genuinely easy. The cases that separate tools are the ones that are hard to arrange on a real chain and therefore rarely tested: a reorg that removes an event rather than changing it, a reorg deeper than the tool's unfinalised window, a reorg that happens while the tool is offline, and a second reorg arriving while the first is still being unwound. Each is one check below, because a tool can pass any of them and fail the rest.",
    method:
      "The tool tracks the head of the mock chain while the chain is rewritten to order. Each case rewrites a stated depth, either replacing the events in those blocks with different ones or dropping them entirely, and then the chain is advanced past the rewrite and left alone until the tool has caught up. The data is compared against the chain as it finally stands — the check is not that the tool noticed, it is that what it holds is what is on the chain.",
    checks: [
      {
        id: "shallow",
        label: "a one-block reorg that changes an event",
        detail:
          "The head block is replaced with one carrying different transfer amounts. Afterwards the stored amounts are the new ones. The baseline case: a tool that fails here has no reorg handling at all.",
      },
      {
        id: "removes-event",
        label: "a reorg that removes an event entirely",
        detail:
          "The replacement blocks carry no logs. The rows for the discarded events must be gone, and any aggregate they contributed to must be back to what it was. This is the case an upsert-shaped rollback fails silently: writing the new state over the old works when there is new state, and does nothing at all when the event simply stopped existing.",
      },
      {
        id: "deep",
        label: "a reorg deeper than the unfinalised window",
        detail:
          "Sixty blocks are rewritten — past the depth most tools keep rollback information for. Handling it correctly is one thing; the check is that the tool either handles it or stops and says so. Carrying on with data it can no longer reconcile is the failing outcome, and it is the common one.",
      },
      {
        id: "while-down",
        label: "a reorg that happens while the indexer is down",
        detail:
          "The tool is stopped, the chain is rewritten beneath it, and it is started again. Nothing announced the reorg — the tool has to notice that the block it last recorded is no longer on the chain, by checking the hash rather than the height. A tool that resumes from its stored block number without verifying it continues from a fork that no longer exists.",
      },
      {
        id: "storm",
        label: "reorgs arriving faster than they can be unwound",
        detail:
          "Three reorgs in twelve seconds, the second landing while the first is still being rolled back. The end state has to match the chain. This is where reorg handling that assumes it runs to completion — a rollback that is not itself atomic — leaves a mixture of two branches.",
      },
      {
        id: "during-backfill",
        label: "a reorg touching blocks still being backfilled",
        detail:
          "The chain is rewritten at a height the tool has already indexed but has not yet caught up to, so the reorg is behind the head it is working towards. A tool that only checks for reorgs at the head walks straight past it.",
      },
    ],
    measures: [
      {
        id: "reorg-recovery-seconds",
        label: "time to reconcile",
        unit: "s",
        detail:
          "Seconds from the chain being rewritten to the database matching it again, averaged over the cases the tool got right. A tool that is correct in a minute and one that is correct in ten seconds both pass; an operator serving queries off the database cares which.",
      },
    ],
  },

  // ── RPC faults ───────────────────────────────────────────────────────
  {
    id: "rpc-outage",
    title: "The node stops answering",
    group: "rpc-faults",
    summary:
      "Providers rate limit, time out, return 502s from a load balancer, and occasionally accept a request and never answer it. None of that is exceptional and all of it is temporary, so the only acceptable response is to retry and carry on. The failure modes worth finding are the two extremes: a tool that exits on the first error, and a tool that retries so eagerly it is indistinguishable from an attack on the provider that is already struggling.",
    method:
      "While the tool indexes, the mock chain is made to fail in four ways in turn, thirty seconds each: JSON-RPC errors, HTTP 429 with a rate-limit body, HTTP 502, and accepting requests without ever answering them. The endpoint counts what arrives during each, so a retry policy can be seen rather than assumed. Then it heals, and the range is finished and verified.",
    checks: [
      {
        id: "survives",
        label: "survives every fault without exiting",
        detail:
          "The process is still running after all four windows. The stall is the one that catches tools out: an error comes back and can be reacted to, while a request that is simply never answered needs a client-side timeout to exist at all.",
      },
      {
        id: "resumes",
        label: "resumes promptly once the node recovers",
        detail:
          "Progress moves again within thirty seconds of the endpoint healing. A tool that backed off exponentially without a ceiling is technically fine and practically down.",
      },
      {
        id: "no-loss",
        label: "loses nothing to a failed request",
        detail:
          "The finished range matches ground truth. A range whose request failed has to be retried, not skipped — and a tool that treats an error body as an empty result set records the blocks it never read as blocks that held nothing.",
      },
      {
        id: "backs-off",
        label: "backs off rather than hammering",
        detail:
          "Requests during a fault window stay under twenty times the tool's own healthy rate. Not a correctness property, but the difference between a provider that recovers and one that stays down because every indexer pointed at it is retrying in a tight loop.",
      },
    ],
  },
  {
    id: "rpc-limits",
    title: "The node refuses the question",
    group: "rpc-faults",
    summary:
      "Public endpoints cap what one request may ask for: a block range, a number of results, a response size. The caps differ per provider and are discovered by hitting them. A tool that splits its query and carries on is portable across providers; a tool that does not is pinned to whichever endpoint it was developed against.",
    method:
      "The mock chain enforces a thousand-block ceiling on `eth_getLogs` and refuses any response over ten thousand logs, with the error strings the common providers use. The tool is pointed at it with no configuration hinting at either limit, and the endpoint records the widest range it was asked for.",
    checks: [
      {
        id: "splits-range",
        label: "narrows its range when one is refused",
        detail:
          "The tool finishes the range, having retried with a smaller one rather than stopping. Configuring the limit up front is not a pass: the point is what happens against a provider whose caps were not known in advance.",
      },
      {
        id: "splits-results",
        label: "narrows when the result set is too large",
        detail:
          "The same for the result-count cap, which needs a different response — a narrower range for the same span — and is the one more often left unhandled.",
      },
      {
        id: "recovers-width",
        label: "widens again once it can",
        detail:
          "After a refused range, the tool does not spend the rest of the run at its smallest range. Scored because the alternative — collapsing to single-block queries forever after one refusal — turns a transient limit into a permanent throughput cost.",
      },
    ],
  },
  {
    id: "rpc-inconsistency",
    title: "The node contradicts itself",
    group: "rpc-faults",
    summary:
      "The failure nobody plans for, because it should not happen and does: a load-balanced endpoint answering from two nodes at different heights, so the head goes backwards; a block hash that was valid a second ago and is not now; the same block served twice. A tool that trusts the endpoint's answers unconditionally will happily record any of it.",
    method:
      "The chain is made to answer from behind for a while — a head lower than one already reported — and to serve a block range twice in succession, and a hash the tool has already used is reorged out from under a request in flight.",
    checks: [
      {
        id: "head-goes-backwards",
        label: "tolerates a head that moves backwards",
        detail:
          "The tool neither crashes nor rewinds its own data on the strength of one lagging answer, and carries on once the head recovers. Treating a lagging replica as a reorg is a real and expensive false positive.",
      },
      {
        id: "duplicate-delivery",
        label: "ignores a block range delivered twice",
        detail:
          "The same logs arriving a second time produce no second row and no doubled aggregate. Idempotent ingestion, tested by asking for it rather than hoping.",
      },
      {
        id: "stale-hash",
        label: "handles a block hash that stops existing",
        detail:
          "A request against a hash the chain has reorged away comes back an error, not an empty result. The tool has to treat that as a reorg signal; treating it as a failed request and retrying forever is the stall this check finds.",
      },
    ],
  },

  // ── Data fidelity ────────────────────────────────────────────────────
  {
    id: "awkward-values",
    title: "Legal values that break things",
    group: "data-fidelity",
    summary:
      "Chain data is not the tidy subset a schema was designed around. A token's `symbol()` returns nothing at all; a string field holds a byte Postgres will not store in a text column; a provider emits a log index near the top of an unsigned 32-bit integer. None of these are corrupt data and all of them have stopped an indexer dead — the last one is exactly what ponder-sh/ponder#2373 was opened about. Every check here is a value that must land in the database as itself, or be refused loudly, but never take the process down.",
    method:
      "The mock chain serves a token whose metadata calls answer awkwardly and blocks whose logs carry awkward values, and the case's handlers read that metadata and store it. The database is then read directly: the check is what is in the column, not what the tool logged.",
    checks: [
      {
        id: "null-symbol",
        label: "an empty symbol() is stored as null",
        detail:
          "`symbol()` returns `0x` — no data, which is what a token that does not implement it does. The row must exist with a null symbol. Decoding empty returndata as an empty string is acceptable; crashing, skipping the row, or storing the literal text \"undefined\" is not.",
      },
      {
        id: "nul-byte",
        label: "a NUL byte in a string does not kill the write",
        detail:
          "A symbol containing `\\u0000`, which is legal in a Solidity string and which Postgres will not accept in a `text` column. Either the tool sanitises it or it fails that row explicitly; what it must not do is fail the whole batch forever and stall the indexer behind one token.",
      },
      {
        id: "huge-log-index",
        label: "a log index near the 32-bit ceiling",
        detail:
          "Logs with index `0xffffffe2`, as some providers emit for synthetic logs. Storing it in a signed 32-bit column overflows and halts the backfill outright — the failure reported in ponder-sh/ponder#2373. The check is that the range finishes and the index round-trips.",
      },
      {
        id: "max-uint",
        label: "an unsigned 256-bit maximum survives the round trip",
        detail:
          "A transfer of 2^256-1. The stored value must equal it exactly. Anything that goes through a double loses precision quietly, which is worse than failing.",
      },
      {
        id: "empty-blocks",
        label: "long empty stretches advance progress",
        detail:
          "Five hundred blocks with no logs at all. The tool's progress must move through them: a tool that tracks position only by the last row it wrote appears to be stuck, and stops answering how far along it is.",
      },
    ],
  },

  // ── Head latency ─────────────────────────────────────────────────────
  {
    id: "block-to-row",
    title: "From block to row",
    group: "head-latency",
    summary:
      "Backfill throughput says how long a tool takes to catch up once. Head latency says what it is like to live with afterwards: the gap between a block being published and its rows being readable is the staleness of everything built on the indexer. It is a distribution rather than a number — the median is the ordinary experience, and the tail is the one that shows up as a bug report.",
    method:
      "The mock chain publishes a block every two seconds for five minutes, stamping the wall clock as each becomes the head. The harness polls the tool's own tables and records when each block's rows first become readable. The difference is the latency; the distribution is reported rather than an average, because a tool that batches every thirty seconds and one that writes continuously can share a mean while feeling nothing alike. The last minute repeats the exercise across a reorg, since that is when staleness costs the most.",
    checks: [
      {
        id: "median-under-block-time",
        label: "median latency inside one block time",
        detail:
          "Half of all blocks are readable within two seconds of being published. This is the property that lets an application read the indexer instead of the chain.",
      },
      {
        id: "tail-bounded",
        label: "the slowest one percent stays under ten seconds",
        detail:
          "The tail matters more than the median for anything user-facing. A tool that flushes on a timer has a tail the length of its timer, whatever its median says.",
      },
      {
        id: "keeps-up",
        label: "never falls behind the chain",
        detail:
          "The gap between the chain head and the tool's position never exceeds five blocks for more than fifteen seconds. A tool that cannot keep up with a two-second block time at the head is only ever catching up.",
      },
      {
        id: "recovers-after-reorg",
        label: "returns to its normal latency after a reorg",
        detail:
          "Within thirty seconds of a reorg being reconciled, latency is back in the band it held before. Reorg handling that pauses ingestion for a minute is a correctness win and an availability cost, and both belong in the record.",
      },
    ],
    measures: [
      {
        id: "p50-ms",
        label: "median latency",
        unit: "ms",
        headline: true,
        detail:
          "Median milliseconds from a block being published to its rows being readable. This is the number published in the table's head lag column.",
      },
      {
        id: "p99-ms",
        label: "99th percentile latency",
        unit: "ms",
        detail: "The tail, over the same run.",
      },
      {
        id: "max-lag-blocks",
        label: "worst lag behind the head",
        unit: "blocks",
        detail: "The largest gap seen between the chain head and the tool's position.",
      },
    ],
  },
];

/** Scenarios in a group, in catalog order. */
export function scenariosIn(group: string): Scenario[] {
  return SCENARIOS.filter((scenario) => scenario.group === group);
}

/** How many claims a scenario makes about a tool. */
export function checkCount(scenario: Scenario): number {
  return scenario.checks.length;
}

// ── What is not measured ───────────────────────────────────────────────

/**
 * Failures worth scoring that the suite does not yet ask about.
 *
 * A score is a claim about a list, so the list is the argument. Publishing it
 * without also publishing what it leaves out invites the reading it cannot
 * support — that a tool scoring 6 of 6 is reliable, rather than that it passed
 * six specific checks. These are the ones already identified as fair game,
 * kept here rather than in an issue tracker so that the page a reader lands on
 * from a score is honest about its own edges, and so that adding one is a
 * matter of moving an entry up into SCENARIOS rather than remembering it.
 *
 * `why` says what the failure costs in production; `how` sketches what the
 * harness would have to do, because a candidate nobody knows how to measure is
 * a wish rather than a backlog item.
 */
export interface Candidate {
  title: string;
  /** Which column it would join, or "new" if it needs one of its own. */
  group: string | "new";
  why: string;
  how: string;
}

export const CANDIDATES: Candidate[] = [
  {
    title: "Determinism across two identical runs",
    group: "data-fidelity",
    why: "A tool that processes several block ranges at once can produce different aggregates on two runs over the same range, and nothing about a single run reveals it. It surfaces later as a database that disagrees with a rebuild of itself, which is the hardest class of bug to argue about with a vendor.",
    how: "Index the same fixed range twice from a clean database and compare the two checksums. Costs a second run per tool and nothing else; this is the cheapest candidate on the list.",
  },
  {
    title: "A handler that throws",
    group: "crash-recovery",
    why: "User code fails — a bad decode, a null where one was not expected, a division by zero on an empty pool. What the tool does then is a design decision that is rarely documented and never the same twice: retry the event, skip it, stop the indexer, or write the row without it. Each is defensible; silently skipping is the one that loses data without saying so.",
    how: "Serve a block whose log decodes to a value the case's handler divides by, and watch what reaches the database and what reaches the exit code.",
  },
  {
    title: "Backpressure when the database is slow",
    group: "crash-recovery",
    why: "A database under load does not fail, it slows down. An indexer that keeps fetching regardless grows its in-memory queue until the process is killed, and the crash then looks like an OOM with no cause. An indexer that throttles gets slower and stays up.",
    how: "Put a proxy in front of Postgres that adds a hundred milliseconds to every statement, index at the head, and record resident memory. The check is that memory stays bounded, not that throughput holds.",
  },
  {
    title: "Crash-loop on poison state",
    group: "crash-recovery",
    why: "The worst outage shape there is: a tool that crashes on something in its own database, restarts, reads it again, and crashes again, forever, with no way through short of wiping and re-indexing.",
    how: "Combine two checks the suite already has — the NUL byte in a string, and the process kill — so the tool restarts into the row it died on, then count restarts before progress moves.",
  },
  {
    title: "Reading the indexer while it is reorging",
    group: "reorgs",
    why: "Correct data eventually is not the same as correct data throughout. An application querying an indexer mid-rollback can see a state that was never on the chain — the old rows deleted and the new ones not yet written — which is a consistency claim most tools have never had to make out loud.",
    how: "Poll the tool's own API, not its tables, across a reorg, and check that every response is a state the chain actually held.",
  },
  {
    title: "Schema change on restart",
    group: "new",
    why: "The everyday operation nobody scores: a column is added and the tool is restarted against a database written by the previous schema. Refusing to start is a fine answer, re-indexing from scratch is a fine answer, and quietly serving a mixture of the two shapes is not.",
    how: "Index a range, change the schema, restart, and record which of the three happens. Needs a second schema per tool, which is why it is a candidate rather than a scenario.",
  },
  {
    title: "Multi-chain skew",
    group: "new",
    why: "Most production indexers read more than one chain, and the interesting failure is one chain stalling: does the other keep going, or does a shared checkpoint hold it back until both are stuck?",
    how: "Serve two mock chains and stall one. Cheap to arrange, and needs a second network in every tool's project — the reason it is not in the first cut.",
  },
  {
    title: "Disk exhaustion",
    group: "new",
    why: "Postgres out of space is a distinct failure from Postgres gone: writes fail while reads succeed, indefinitely, and a tool that treats it as a transient error retries forever without saying anything useful.",
    how: "Cap the database volume and index past it. Harder to make deterministic than the rest of the list, since what fails first depends on the tool's write pattern.",
  },
];
