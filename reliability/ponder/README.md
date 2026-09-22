# The reliability case, in Ponder

Implements the case every reliability project implements: a `Transfer` row per
log with its block and log index, an `Account` balance that the transfers move,
and a `Token` row written from a contract read on the first transfer seen.

One thing here is deliberate rather than incidental. `logIndex` is a `bigint`
column, not an `integer`. Some providers emit synthetic logs with indices near
the top of an unsigned 32-bit integer, one of the scenarios serves exactly
those, and storing them in a 32-bit column overflows and halts the backfill -
which is the failure [ponder-sh/ponder#2373](https://github.com/ponder-sh/ponder/pull/2373)
was opened about. The schema here is written so that the check is about what
Ponder does with the value rather than about the column this project chose.
