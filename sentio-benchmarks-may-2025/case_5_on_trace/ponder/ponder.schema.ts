import { onchainTable } from "ponder";

export const swap = onchainTable("swap", (t) => ({
  id: t.text().primaryKey(),
  blockNumber: t.bigint().notNull(),
  transactionHash: t.text().notNull(),
  from: t.text().notNull(),
  to: t.text().notNull(),
  amountIn: t.text().notNull(), // Store as string to handle large numbers
  amountOutMin: t.text().notNull(), // Store as string to handle large numbers
  deadline: t.text().notNull(), // Store as string to handle large numbers
  path: t.text().notNull(), // Comma-separated path of token addresses
  pathLength: t.integer().notNull(),
}));
