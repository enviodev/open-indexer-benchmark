import { onchainTable } from "ponder";

export const block = onchainTable("block", (t) => ({
  id: t.varchar().primaryKey(),
  number: t.bigint().notNull(),
  hash: t.varchar().notNull(),
  parentHash: t.varchar().notNull(),
  timestamp: t.bigint().notNull(),
}));
