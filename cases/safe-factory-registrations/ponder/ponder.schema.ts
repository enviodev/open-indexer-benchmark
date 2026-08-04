import { onchainTable } from "ponder";

export const safe = onchainTable("safe", (t) => ({
  id: t.text().primaryKey(),
  address: t.hex().notNull(),
  singleton: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const safeSetup = onchainTable("safe_setup", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  initiator: t.hex().notNull(),
  threshold: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const safeReceived = onchainTable("safe_received", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  sender: t.hex().notNull(),
  value: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const safeModuleTransaction = onchainTable("safe_module_transaction", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  module: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
  // `operation` is a reserved column name in Ponder.
  operationType: t.integer().notNull(),
  timestamp: t.integer().notNull(),
}));

export const safeMultiSigTransaction = onchainTable("safe_multi_sig_transaction", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
  // `operation` is a reserved column name in Ponder.
  operationType: t.integer().notNull(),
  timestamp: t.integer().notNull(),
}));

export const executionSuccess = onchainTable("execution_success", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  payment: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const executionFailure = onchainTable("execution_failure", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  payment: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const changedThreshold = onchainTable("changed_threshold", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  threshold: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const changedMasterCopy = onchainTable("changed_master_copy", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  singleton: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const changedFallbackHandler = onchainTable("changed_fallback_handler", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  handler: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const changedGuard = onchainTable("changed_guard", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  guard: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const changedModuleGuard = onchainTable("changed_module_guard", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  moduleGuard: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const enabledModule = onchainTable("enabled_module", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  module: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const disabledModule = onchainTable("disabled_module", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  module: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const addedOwner = onchainTable("added_owner", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  owner: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));

export const removedOwner = onchainTable("removed_owner", (t) => ({
  id: t.text().primaryKey(),
  safe: t.hex().notNull(),
  owner: t.hex().notNull(),
  timestamp: t.integer().notNull(),
}));
