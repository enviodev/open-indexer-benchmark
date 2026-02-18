import { SentioProcessor } from './types/eth/sentio.js'

import { Block } from './schema/schema.js'


SentioProcessor.bind({ address: "0x0000000000000000000000000000000000000000", 
    startBlock: 0, endBlock: 100000 })
    .onBlockInterval(async (block, ctx) => {
        const blockEntity = new Block({
            id: `${ctx.chainId}_${block.number}`,
            number: BigInt(block.number),
            hash: block.hash || '',
            parentHash: block.parentHash || '',
            timestamp: BigInt(block.timestamp || 0)
        })
        await ctx.store.upsert(blockEntity);
    }, 1, 1)
