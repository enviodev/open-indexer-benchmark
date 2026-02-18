import {TypeormDatabase} from '@subsquid/typeorm-store'
import {Transfer} from './model'
import {processor} from './processor'
import {events} from "./abi/LBTC.js"

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    const transfers: Transfer[] = []
    
    for (let block of ctx.blocks) {
        for (let log of block.logs) {
            // Filter for Transfer events
            if (log.topics[0] === events.Transfer.topic) {
                // Decode the Transfer event data
                const {from, to, value} = events.Transfer.decode(log)
                
                transfers.push(
                    new Transfer({
                        id: `${block.header.id}_${block.header.height}_${log.logIndex}`,
                        from: from,
                        to: to,
                        value: value,
                        blockNumber: BigInt(block.header.height),
                        transactionHash: Buffer.from(log.getTransaction().hash, 'hex')
                    })
                )
            }
        }
    }
    
    const startBlock = ctx.blocks.at(0)?.header.height
    const endBlock = ctx.blocks.at(-1)?.header.height
    ctx.log.info(`Processed ${transfers.length} transfers from ${startBlock} to ${endBlock}`)

    // Insert all transfers
    await ctx.store.insert(transfers)
})
