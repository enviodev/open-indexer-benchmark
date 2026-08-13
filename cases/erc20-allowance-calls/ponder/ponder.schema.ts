import { onchainTable } from "ponder";

export const approvalEvent = onchainTable("approval_event", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  owner: t.hex().notNull(),
  spender: t.hex().notNull(),
  approved: t.bigint().notNull(),
  allowance: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const tokenAllowance = onchainTable("token_allowance", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  owner: t.hex().notNull(),
  spender: t.hex().notNull(),
  allowance: t.bigint().notNull(),
}));
