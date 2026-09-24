import { onchainTable } from "ponder";

/**
 * One row per Transfer log, carrying enough to compare against the chain:
 * which block, which log index, and the value moved.
 *
 * `logIndex` is a bigint rather than an integer on purpose. Some providers
 * emit synthetic logs with indices near the top of an unsigned 32-bit integer,
 * which is what ponder-sh/ponder#2373 was opened about, and one of this
 * suite's scenarios serves exactly those. A 32-bit column would overflow.
 */
export const transfer = onchainTable("transfer", (t) => ({
  id: t.text().primaryKey(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.bigint().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  amount: t.bigint().notNull(),
}));

/** The running balance, which is what shows a batch applied twice. */
export const account = onchainTable("account", (t) => ({
  id: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
}));

/**
 * One row per MetadataUpdated log: the second event the chain emits.
 *
 * It is here because a tool configured for two events that indexes one of
 * them looks perfect in every check that reads transfers, which is most of
 * them.
 */
export const metadataUpdate = onchainTable("metadata_update", (t) => ({
  id: t.text().primaryKey(),
  blockNumber: t.bigint().notNull(),
  logIndex: t.bigint().notNull(),
  symbol: t.text(),
  name: t.text(),
}));

/** Written from a contract read whose answers are deliberately awkward. */
export const token = onchainTable("token", (t) => ({
  id: t.hex().primaryKey(),
  symbol: t.text(),
  name: t.text(),
}));
