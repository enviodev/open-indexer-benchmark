import { onchainTable } from "ponder";

export const lbtcTransfer = onchainTable("lbtc_transfer", (t) => ({
  id: t.text().primaryKey(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  value: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));
