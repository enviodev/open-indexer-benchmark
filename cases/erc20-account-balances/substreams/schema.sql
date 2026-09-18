-- The four tables every implementation of this scenario writes. The event rows
-- are keyed block-logIndex, and the aggregates on what identifies them: an
-- account by its address, an allowance by owner and spender.
CREATE TABLE IF NOT EXISTS transfer_event (
    "id"              TEXT PRIMARY KEY,
    "amount"          NUMERIC NOT NULL,
    "from_address"    TEXT    NOT NULL,
    "to_address"      TEXT    NOT NULL,
    "block_timestamp" BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_event (
    "id"              TEXT PRIMARY KEY,
    "amount"          NUMERIC NOT NULL,
    "owner_address"   TEXT    NOT NULL,
    "spender_address" TEXT    NOT NULL,
    "block_timestamp" BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
    "id"      TEXT PRIMARY KEY,
    "balance" NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS allowance (
    "id"              TEXT PRIMARY KEY,
    "owner_address"   TEXT    NOT NULL,
    "spender_address" TEXT    NOT NULL,
    "amount"          NUMERIC NOT NULL
);
