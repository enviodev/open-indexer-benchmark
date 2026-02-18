// @ts-ignore - Ignore 'ponder' module not found error as it's a Ponder-specific import
import { onchainTable } from "ponder";

// @ts-ignore - Ignore 't' parameter type
export const gasSpent = onchainTable("gas_spent", (t) => ({
  id: t.text().primaryKey(), // transaction hash
  from_address: t.hex().notNull(), // From address (renamed to avoid SQL keyword)
  to_address: t.hex().notNull(), // To address (renamed to avoid SQL keyword)
  gasValueString: t.text().notNull(), // gasPrice * gasUsed as a string
  gasUsedString: t.text().notNull(), // Gas used by the transaction as a string
  gasPriceString: t.text().notNull(), // Base gas price as a string
  effectiveGasPriceString: t.text(), // Effective gas price (for EIP-1559 transactions)
  blockNumberString: t.text().notNull(), // Block number as a string
  transactionHash: t.hex().notNull(),
}));
