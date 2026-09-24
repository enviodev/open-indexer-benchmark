# The reliability case, in the Envio Indexer

Implements the case every reliability project implements: a `Transfer` row per
log with its block and log index, an `Account` balance that the transfers move,
and a `Token` row written from a contract read.

The metadata read is guarded by a module-level promise rather than made in the
handler each time. Handlers run twice - once across the batch in preload, where
nothing is written, and once in block order - so an unguarded call would be two
calls per transfer instead of one for the whole run. Whoever gets there first
makes the call; everyone else awaits the same answer.

`logIndex` is a `BigInt`, for the reason the Ponder project's README gives: one
scenario serves log indices near the top of an unsigned 32-bit integer, and the
check should be about what the indexer does with them.
