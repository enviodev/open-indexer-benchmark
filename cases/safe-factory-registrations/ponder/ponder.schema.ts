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
  operation: t.integer().notNull(),
  timestamp: t.integer().notNull(),
}));
