import { onchainTable } from "ponder";

export const Pair = onchainTable("pair", (t) => ({
  id: t.text().primaryKey(),
  token0: t.text(),
  token1: t.text(),
  factory: t.text(),
  createdAt: t.bigint(),
}));

export const Swap = onchainTable("swap", (t) => ({
  id: t.text().primaryKey(),
  pairId: t.text(),
  sender: t.text(),
  to: t.text(),
  amount0In: t.bigint(),
  amount0Out: t.bigint(),
  amount1In: t.bigint(),
  amount1Out: t.bigint(),
  timestamp: t.bigint(),
  blockNumber: t.bigint(),
}));
