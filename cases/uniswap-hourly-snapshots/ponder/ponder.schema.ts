import { onchainTable } from "ponder";

export const pool = onchainTable("pool", (t) => ({
  id: t.text().primaryKey(),
  sqrtPriceX96: t.bigint().notNull(),
  tick: t.bigint().notNull(),
}));

export const swap = onchainTable("swap", (t) => ({
  id: t.text().primaryKey(),
  amount0: t.bigint().notNull(),
  amount1: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
}));

export const hourlySnapshot = onchainTable("hourly_snapshot", (t) => ({
  id: t.text().primaryKey(),
  timestamp: t.integer().notNull(),
  blockNumber: t.integer().notNull(),
  // Named explicitly: the default snake_case mapping gives sqrt_price_x_96.
  sqrtPriceX96: t.bigint("sqrt_price_x96").notNull(),
  tick: t.bigint().notNull(),
}));
