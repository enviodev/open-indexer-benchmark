import { indexer } from "envio";

/** USD Coin. The case tracks one mint, the way the upstream Substreams package
 *  takes `token_contract:<address>` as its only parameter. */
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const fields = {
  instruction: ["accounts", "args", "path"],
  transaction: ["signature"],
  accountActivity: ["token.mint"],
  block: ["time"],
} as const;

// `transferChecked` names the mint in its account list, so the allowlist is a
// server-side filter and nothing has to be discarded after the fact.
indexer.onInstruction(
  {
    program: "SplToken",
    instruction: "transferChecked",
    fields,
    where: { accounts: { mint: MINT } },
  },
  async ({ instruction, context }) => {
    context.Transfer.set({
      id: `${instruction.transaction.signature}:${instruction.path.join(".")}`,
      amount: instruction.args.amount,
      source: instruction.accounts.source.address,
      destination: instruction.accounts.destination.address,
      signer: instruction.accounts.authority.address,
      txSignature: instruction.transaction.signature,
      checked: true,
      slot: instruction.block.slot,
      timestamp: instruction.block.time,
    });
  }
);

// Plain `transfer` carries no mint — its accounts are (source, destination,
// authority) — so which token moved is only knowable from the transaction's
// token balances. The source account's own activity answers it exactly; the
// upstream package instead asks whether *any* balance in the transaction
// carries the mint, which over-matches every swap that touches two tokens.
indexer.onInstruction(
  { program: "SplToken", instruction: "transfer", fields },
  async ({ instruction, context }) => {
    if (instruction.accounts.source.activity?.token?.mint !== MINT) return;

    context.Transfer.set({
      id: `${instruction.transaction.signature}:${instruction.path.join(".")}`,
      amount: instruction.args.amount,
      source: instruction.accounts.source.address,
      destination: instruction.accounts.destination.address,
      signer: instruction.accounts.authority.address,
      txSignature: instruction.transaction.signature,
      checked: false,
      slot: instruction.block.slot,
      timestamp: instruction.block.time,
    });
  }
);
