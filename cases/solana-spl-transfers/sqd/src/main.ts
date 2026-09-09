import { run } from "@subsquid/batch-processor";
import { augmentBlock } from "@subsquid/solana-objects";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import * as tokenProgram from "./abi/token-program";
import { dataSource, MINT } from "./processor";
import { Transfer } from "./model";

const { transfer, transferChecked } = tokenProgram.instructions;

run(dataSource, new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  const transfers: Transfer[] = [];

  for (const block of ctx.blocks.map(augmentBlock)) {
    const timestamp = Math.floor(block.header.timestamp / 1000);

    for (const ins of block.instructions) {
      if (ins.programId !== tokenProgram.programId) continue;

      const checked = ins.d1 === transferChecked.d1;
      if (!checked && ins.d1 !== transfer.d1) continue;

      const { accounts, data } = checked
        ? transferChecked.decode(ins)
        : transfer.decode(ins);

      if (!checked) {
        // Either account answers which token moved, because SPL Token rejects
        // a transfer between different mints, and reading only the source
        // would lose the transfers whose source the transaction itself opened
        // — such an account has no balance before it, only after.
        const balances = ins.getTransaction().tokenBalances;
        const mintOf = (account: string) => {
          const balance = balances.find((b) => b.account === account);
          return balance?.preMint ?? balance?.postMint;
        };
        if (
          mintOf(accounts.source) !== MINT &&
          mintOf(accounts.destination) !== MINT
        ) {
          continue;
        }
      }

      transfers.push(
        new Transfer({
          // Leading with the slot so progress can be read straight off the id,
          // the way it is for every other scenario here.
          id: `${block.header.number}-${ins.transactionIndex}-${ins.instructionAddress.join(".")}`,
          amount: data.amount,
          source: accounts.source,
          destination: accounts.destination,
          signer: accounts.authority,
          txSignature: ins.getTransaction().signatures[0],
          checked,
          slot: block.header.number,
          timestamp,
        })
      );
    }
  }

  if (transfers.length > 0) {
    await ctx.store.insert(transfers);
  }
});
