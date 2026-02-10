import {TypeormDatabase} from '@subsquid/typeorm-store'
import {GasSpent} from './model/generated/gasSpent.model'
import {processor} from './processor'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    const gasRecords: GasSpent[] = []
    for (let block of ctx.blocks) {
        // Process transactions for gas usage
        for (let txn of block.transactions) {
            if (txn.gasUsed !== undefined && (txn.gasPrice !== undefined || txn.effectiveGasPrice !== undefined)) {
                const from = txn.from.toLowerCase()
                const to = txn.to ? txn.to.toLowerCase() : '0x0'
                
                // Get gas parameters
                const gasUsed = BigInt(txn.gasUsed)
                const gasPrice = txn.gasPrice !== undefined ? BigInt(txn.gasPrice) : BigInt(0)
                const effectiveGasPrice = txn.effectiveGasPrice !== undefined ? BigInt(txn.effectiveGasPrice) : undefined
                const priceForCalculation = effectiveGasPrice !== undefined ? effectiveGasPrice : gasPrice
                const gasValue = gasUsed * priceForCalculation
                
                // Debug logging for the first few transactions
                // if (gasRecords.length < 5 || block.header.height === 22280000) {
                //     console.log(`Gas Calculation Details for tx ${txn.hash}:`);
                //     console.log(`- gasUsed: ${gasUsed.toString()}`);
                //     console.log(`- gasPrice: ${gasPrice.toString()}`);
                //     console.log(`- effectiveGasPrice: ${effectiveGasPrice !== undefined ? effectiveGasPrice.toString() : 'N/A'}`);
                //     console.log(`- gasValue (gasUsed * price): ${gasValue.toString()}`);
                // }
                
                gasRecords.push(
                    new GasSpent({
                        id: txn.hash,
                        from: from,
                        to: to,
                        gasValue: gasValue,
                        gasUsed: gasUsed,
                        gasPrice: gasPrice,
                        effectiveGasPrice: effectiveGasPrice,
                        blockNumber: BigInt(block.header.height),
                        transactionHash: Buffer.from(txn.hash.substring(2), 'hex') // More efficient by removing '0x' prefix
                    })
                )
            }
        }
    }
    // Insert all entities
    await ctx.store.insert(gasRecords)
})
