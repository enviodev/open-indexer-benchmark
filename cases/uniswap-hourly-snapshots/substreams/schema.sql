-- The two tables every implementation of this scenario writes. A swap is keyed
-- block-logIndex, and a snapshot on the start of the UTC hour it covers.
CREATE TABLE IF NOT EXISTS swap (
    "id"        TEXT PRIMARY KEY,
    "amount0"   NUMERIC NOT NULL,
    "amount1"   NUMERIC NOT NULL,
    "timestamp" BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS hourly_snapshot (
    "timestamp"      BIGINT  PRIMARY KEY,
    "block_number"   BIGINT  NOT NULL,
    "sqrt_price_x96" NUMERIC NOT NULL,
    "tick"           INTEGER NOT NULL
);
