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
