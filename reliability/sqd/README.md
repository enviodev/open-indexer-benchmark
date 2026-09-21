# The reliability case, as a squid

Implements the case every reliability project implements: a `Transfer` row per
log with its block and log index, an `Account` balance that the transfers move,
and a `Token` row written from a contract read.

Two things are worth knowing about this one.

There is no gateway. Reliability is only measured over RPC, because the
benchmark cannot make SQD Network reorg or fail on demand, so the processor is
configured the way SQD documents for a chain its network does not cover.
`setFinalityConfirmation` is therefore load-bearing here rather than incidental:
it decides how far back the processor will unwind when the chain rewrites
itself, which is most of what the reorg scenarios are asking about.

The ABI bindings in `src/abi/ERC20.ts` are written by hand rather than produced
by `squid-evm-typegen`. The generated file for a full ERC-20 is a few hundred
lines of bindings this case never calls; three entries are easier to read, and
`pnpm typegen` still regenerates the full thing if it is ever wanted.
