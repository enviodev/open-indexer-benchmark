import { onchainTable } from "ponder";

export const account = onchainTable("account", (t) => ({
  id: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
}));

export const transferEvent = onchainTable("transfer_event", (t) => ({
  id: t.text().primaryKey(),
  amount: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
}));

export const allowance = onchainTable("allowance", (t) => ({
  id: t.text().primaryKey(),
  amount: t.bigint().notNull(),
  owner: t.hex().notNull(),
  spender: t.hex().notNull(),
}));

export const approvalEvent = onchainTable("approval_event", (t) => ({
  id: t.text().primaryKey(),
  amount: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
  owner: t.hex().notNull(),
  spender: t.hex().notNull(),
}));
