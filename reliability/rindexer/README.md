# The reliability case, as a no-code rindexer project

`rindexer.yaml` is the whole project. The `Transfer` rows come from rindexer's
own event storage, which writes the decoded parameters alongside the block
number and log index every comparison against the chain needs, and the running
balance comes from a declared table whose upserts add and subtract on each
transfer.

## What the first real run will confirm

rindexer's own event storage writes the decoded parameters alongside the
block number and log index, which is what the `Transfer` comparison needs. That
column set is rindexer's rather than this project's, so if it ever changes the
harness says which column it could not find and names this project - a
diagnosable failure rather than a silent wrong score.

## The token row is missing here, on purpose

Every other reliability project writes a `Token` row from a contract read - a
`symbol()` that answers with no data and a `name` carrying a byte Postgres will
not store. A no-code rindexer project has no facility for reading contract
state: the yaml describes events and the tables they write, and nothing else.

So this row has no token table, and the two data-fidelity checks that read one
come back **unmeasured** rather than failed. That is the accurate statement -
the scenario could not put the question to this project - and it is visible in
the table as a smaller denominator rather than as a mark against the tool.

Writing those two checks would mean a rust rindexer project instead, which is
what the External Contract Calls scenario uses for the same reason. That is a
fair thing to want; it is a different project rather than a change to this one.
