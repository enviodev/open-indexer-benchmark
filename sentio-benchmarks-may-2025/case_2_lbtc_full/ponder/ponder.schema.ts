import { onchainTable } from "ponder";

export const snapshot = onchainTable("snapshot", (t) => ({
  id: t.text().primaryKey(),
  accountId: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
  mintAmount: t.bigint().notNull(),
  balance: t.bigint().notNull(),
  point: t.bigint().notNull(),
}));

export const accounts = onchainTable("accounts", (t) => ({
  id: t.hex().primaryKey(),
  lastSnapshotTimestamp: t.bigint().notNull(),
  balance: t.bigint().notNull(),
  point: t.bigint().notNull(),
}));

export const lbtcTransfer = onchainTable("lbtc_transfer", (t) => ({
  id: t.text().primaryKey(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));
