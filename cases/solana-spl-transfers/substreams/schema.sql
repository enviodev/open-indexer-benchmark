-- The row every implementation of this scenario writes, keyed the same way, so
-- the benchmark's storage column compares indexers rather than primary keys.
CREATE TABLE IF NOT EXISTS transfer (
    "id"           TEXT PRIMARY KEY,
    "amount"       NUMERIC NOT NULL,
    "source"       TEXT    NOT NULL,
    "destination"  TEXT    NOT NULL,
    "signer"       TEXT    NOT NULL,
    "tx_signature" TEXT    NOT NULL,
    "checked"      BOOLEAN NOT NULL,
    "slot"         BIGINT  NOT NULL,
    "timestamp"    BIGINT  NOT NULL
);
