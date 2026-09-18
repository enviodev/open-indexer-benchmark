import { DataSourceBuilder } from "@subsquid/solana-stream";
import * as dotenv from "dotenv";
import * as tokenProgram from "./abi/token-program";

dotenv.config();

/** USD Coin. */
export const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const START_SLOT = 440_000_000;

// SQD serves Solana through its Portal; there is no RPC source to switch to,
// so this scenario has none of the EVM ones' `SQD_SOURCE` branching.
const PORTAL = "https://portal.sqd.dev/datasets/solana-mainnet";

// The benchmark runner always supplies an end block; without one the indexer
// would silently run unbounded and the verification phase would never finish.
function requireEndBlock(): number {
  const value = Number(process.env.SQD_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "SQD_END_BLOCK must be set to the slot to stop at (the benchmark runner sets it)"
    );
  }
  return value;
}

const apiKey = process.env.SQD_API_KEY;

export const dataSource = new DataSourceBuilder()
  .setPortal({
    url: PORTAL,
    http: {
      retryAttempts: 10,
      ...(apiKey ? { headers: { "x-api-key": apiKey } } : {}),
    },
  })
  .setBlockRange({ from: START_SLOT, to: requireEndBlock() })
  .setFields({
    block: { timestamp: true },
    transaction: { signatures: true },
    instruction: { programId: true, accounts: true, data: true },
    // Which token a plain `transfer` moved is only knowable from these.
    tokenBalance: { account: true, preMint: true, postMint: true },
  })
  // `transferChecked` names its mint in account slot 1, so the Portal filters
  // on it and nothing arrives that has to be discarded.
  .addInstruction({
    where: {
      programId: [tokenProgram.programId],
      d1: [tokenProgram.instructions.transferChecked.d1],
      ...tokenProgram.instructions.transferChecked.accountSelection({
        mint: [MINT],
      }),
      isCommitted: true,
    },
    include: { transaction: true },
  })
  // Plain `transfer` carries no mint, so every one of them is read and the
  // transaction's token balances decide.
  .addInstruction({
    where: {
      programId: [tokenProgram.programId],
      d1: [tokenProgram.instructions.transfer.d1],
      isCommitted: true,
    },
    include: { transaction: true, transactionTokenBalances: true },
  })
  .build();
