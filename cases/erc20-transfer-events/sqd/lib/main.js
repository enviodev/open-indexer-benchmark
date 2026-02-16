"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_store_1 = require("@subsquid/typeorm-store");
const processor_1 = require("./processor");
const model_1 = require("./model");
const ERC20_1 = require("./abi/ERC20");
processor_1.processor.run(new typeorm_store_1.TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
    const transferEvents = [];
    const approvalEvents = [];
    const accountUpdates = new Map();
    const allowanceUpdates = new Map();
    for (let block of ctx.blocks) {
        const timestamp = Math.floor(block.header.timestamp / 1000);
        for (let log of block.logs) {
            if (log.topics[0] === ERC20_1.events.Transfer.topic) {
                const { from, to, value } = ERC20_1.events.Transfer.decode(log);
                // Track balance deltas for accounts
                const fromBalance = accountUpdates.get(from) ?? 0n;
                accountUpdates.set(from, fromBalance - value);
                const toBalance = accountUpdates.get(to) ?? 0n;
                accountUpdates.set(to, toBalance + value);
                transferEvents.push(new model_1.TransferEvent({
                    id: `${block.header.height}-${log.logIndex}`,
                    amount: value,
                    timestamp,
                    from,
                    to,
                }));
            }
            else if (log.topics[0] === ERC20_1.events.Approval.topic) {
                const { owner, spender, value } = ERC20_1.events.Approval.decode(log);
                const allowanceId = `${owner}-${spender}`;
                allowanceUpdates.set(allowanceId, { owner, spender, amount: value });
                approvalEvents.push(new model_1.ApprovalEvent({
                    id: `${block.header.height}-${log.logIndex}`,
                    amount: value,
                    timestamp,
                    owner,
                    spender,
                }));
            }
        }
    }
    await Promise.all([
        // Accounts: load existing then save (sequential internally)
        (async () => {
            if (accountUpdates.size > 0) {
                const accountIds = [...accountUpdates.keys()];
                const existingAccounts = await ctx.store.findBy(model_1.Account, {
                    id: accountIds,
                });
                const existingMap = new Map(existingAccounts.map((a) => [a.id, a]));
                const accounts = [];
                for (const [id, delta] of accountUpdates) {
                    const existing = existingMap.get(id);
                    const currentBalance = existing?.balance ?? 0n;
                    accounts.push(new model_1.Account({ id, balance: currentBalance + delta }));
                }
                await ctx.store.save(accounts);
            }
        })(),
        // Allowances
        allowanceUpdates.size > 0
            ? ctx.store.save([...allowanceUpdates].map(([id, { owner, spender, amount }]) => new model_1.Allowance({ id, owner, spender, amount })))
            : Promise.resolve(),
        // Transfer events
        transferEvents.length > 0
            ? ctx.store.insert(transferEvents)
            : Promise.resolve(),
        // Approval events
        approvalEvents.length > 0
            ? ctx.store.insert(approvalEvents)
            : Promise.resolve(),
    ]);
});
//# sourceMappingURL=main.js.map