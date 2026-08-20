import { onchainTable } from "ponder";

// Both entities are written once per event and never read back. Reliability is
// about which rows survive, so nothing here aggregates: a missing row is a
// missing event rather than an arithmetic difference.

export const transferEvent = onchainTable("transfer_event", (t) => ({
  id: t.text().primaryKey(),
  blockNumber: t.integer().notNull(),
  // Wide enough for the largest index the chain can produce, not merely for the
  // ones it usually does. An int4 here would reject the hostile-values
  // scenario's log before the indexer's own limits ever came into it, and the
  // scenario would be measuring this schema rather than the tool.
  logIndex: t.bigint().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const tokenMetadata = onchainTable("token_metadata", (t) => ({
  id: t.text().primaryKey(),
  blockNumber: t.integer().notNull(),
  logIndex: t.bigint().notNull(),
  symbol: t.text().notNull(),
  name: t.text().notNull(),
}));
