import {TypeormDatabase} from '@subsquid/typeorm-store'
import {Block} from './model'
import {processor} from './processor'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    const blocks: Block[] = []
  
    for (let block of ctx.blocks) {
        // Create a block entity
        blocks.push(
            new Block({
                id: `1-${block.header.height}`, // Using 1 as the chainId for Ethereum mainnet
                number: BigInt(block.header.height),
                hash: block.header.hash,
                parentHash: block.header.parentHash,
                timestamp: BigInt(block.header.timestamp),
            })
        )
    }
    
    const blockStartBlock = ctx.blocks[0]?.header.height
    const blockEndBlock = ctx.blocks[ctx.blocks.length - 1]?.header.height

    // Insert all blocks
    await ctx.store.insert(blocks)
})
