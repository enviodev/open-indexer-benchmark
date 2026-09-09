-- The tables every implementation of this scenario writes, all keyed
-- block-logIndex so the storage column compares indexers rather than keys.
CREATE TABLE IF NOT EXISTS safe (
    "id" TEXT PRIMARY KEY, "proxy" TEXT NOT NULL, "singleton" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS safe_setup (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "initiator" TEXT NOT NULL,
    "threshold" NUMERIC NOT NULL, "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS safe_received (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "sender" TEXT NOT NULL,
    "value" NUMERIC NOT NULL, "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS safe_module_transaction (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "module" TEXT NOT NULL,
    "to_address" TEXT NOT NULL, "value" NUMERIC NOT NULL,
    "operation" NUMERIC NOT NULL, "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS safe_multi_sig_transaction (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "to_address" TEXT NOT NULL,
    "value" NUMERIC NOT NULL, "operation" NUMERIC NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS execution_success (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "payment" NUMERIC NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS execution_failure (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "payment" NUMERIC NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS changed_threshold (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "threshold" NUMERIC NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS changed_master_copy (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "singleton" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS changed_fallback_handler (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "handler" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS changed_guard (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "guard" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS changed_module_guard (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "module_guard" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS enabled_module (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "module" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS disabled_module (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "module" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS added_owner (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "owner" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS removed_owner (
    "id" TEXT PRIMARY KEY, "safe" TEXT NOT NULL, "owner" TEXT NOT NULL,
    "block_timestamp" BIGINT NOT NULL);
