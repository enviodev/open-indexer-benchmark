# The reliability case, as a no-code rindexer project

`rindexer.yaml` is the whole project. The `Transfer` and `MetadataUpdated` rows
come from rindexer's own event storage, which writes the decoded parameters
alongside the block number and log index every comparison against the chain
needs. The running balance and the token row come from two declared tables.

## What rindexer's own storage decides

rindexer's event storage writes the decoded parameters alongside the block
number and log index, which is what the `Transfer` comparison needs. That
column set is rindexer's rather than this project's, so if it ever changes the
harness says which column it could not find and names this project - a
diagnosable failure rather than a silent wrong score.

## The token row

Every reliability project writes a `token` row from a contract read - a
`symbol()` that answers with no data and a `name()` carrying a byte Postgres
will not store. Here that is a declared table whose columns are filled by
`$call_static(...)`, rindexer's view call for values that never change: each
is read once and cached for the run.

What rindexer does with the two awkward answers is rindexer's own behaviour,
not this project's, and is what the data fidelity checks measure:

- **No returndata.** The call yields no value, the column is left out of the
  write, and the nullable column stores a null.
- **A NUL in the name.** rindexer only reads returndata as a string when every
  character is printable; otherwise it falls back to the raw bytes, which a
  text column stores as hex. The row arrives, with no NUL in it - but the name
  is `0x52656c...00546f6b656e` rather than `ReliabilityToken`.

Both columns are `nullable`: a view call that yields nothing would otherwise
fail the row.
