-- The row every implementation of this scenario writes, keyed the same way
-- (block-logIndex), so the benchmark's storage column compares indexers rather
-- than primary keys.
CREATE TABLE IF NOT EXISTS transfer_event (
    "id"              TEXT PRIMARY KEY,
    "amount"          NUMERIC NOT NULL,
    "from_address"    TEXT    NOT NULL,
    "to_address"      TEXT    NOT NULL,
    "block_timestamp" BIGINT  NOT NULL
);
