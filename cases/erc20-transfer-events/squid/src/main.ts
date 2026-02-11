import {TypeormDatabase} from '@subsquid/typeorm-store'
import {processor} from './processor'
import {Account, TransferEvent, Allowance, ApprovalEvent} from './model'
import {events} from './abi/ERC20'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    const transferEvents: TransferEvent[] = []
    const approvalEvents: ApprovalEvent[] = []
    const accountUpdates = new Map<string, bigint>()
    const allowanceUpdates = new Map<string, {owner: string; spender: string; amount: bigint}>()

    for (let block of ctx.blocks) {
        const timestamp = Math.floor(block.header.timestamp / 1000)

        for (let log of block.logs) {
            if (log.topics[0] === events.Transfer.topic) {
                const {from, to, value} = events.Transfer.decode(log)

                // Track balance deltas for accounts
                const fromBalance = accountUpdates.get(from) ?? 0n
                accountUpdates.set(from, fromBalance - value)

                const toBalance = accountUpdates.get(to) ?? 0n
                accountUpdates.set(to, toBalance + value)

                transferEvents.push(
                    new TransferEvent({
                        id: `${block.header.height}-${log.logIndex}`,
                        amount: value,
                        timestamp,
                        from,
                        to,
                    })
                )
            } else if (log.topics[0] === events.Approval.topic) {
                const {owner, spender, value} = events.Approval.decode(log)

                const allowanceId = `${owner}-${spender}`
                allowanceUpdates.set(allowanceId, {owner, spender, amount: value})

                approvalEvents.push(
                    new ApprovalEvent({
                        id: `${block.header.height}-${log.logIndex}`,
                        amount: value,
                        timestamp,
                        owner,
                        spender,
                    })
                )
            }
        }
    }

    // Upsert accounts: load existing, apply deltas
    if (accountUpdates.size > 0) {
        const accountIds = [...accountUpdates.keys()]
        const existingAccounts = await ctx.store.findBy(Account, {id: accountIds as any})
        const existingMap = new Map(existingAccounts.map(a => [a.id, a]))

        const accounts: Account[] = []
        for (const [id, delta] of accountUpdates) {
            const existing = existingMap.get(id)
            const currentBalance = existing?.balance ?? 0n
            accounts.push(new Account({id, balance: currentBalance + delta}))
        }
        await ctx.store.save(accounts)
    }

    // Upsert allowances
    if (allowanceUpdates.size > 0) {
        const allowances: Allowance[] = []
        for (const [id, {owner, spender, amount}] of allowanceUpdates) {
            allowances.push(new Allowance({id, owner, spender, amount}))
        }
        await ctx.store.save(allowances)
    }

    // Insert event records
    if (transferEvents.length > 0) {
        await ctx.store.insert(transferEvents)
    }
    if (approvalEvents.length > 0) {
        await ctx.store.insert(approvalEvents)
    }
})
