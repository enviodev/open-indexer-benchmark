import { LBTCContext } from './types/eth/lbtc.js'
import { BigDecimal } from "@sentio/sdk"

export class Multicall {
    private ctx: LBTCContext
    private address: string

    constructor(ctx: LBTCContext, address: string) {
        this.ctx = ctx
        this.address = address
    }

    async aggregate(
        func: (arg: string) => Promise<bigint>,
        args: string[],
        batchSize: number = 100
    ): Promise<bigint[]> {
        const results: bigint[] = []
        
        // Process in batches to avoid RPC timeouts
        for (let i = 0; i < args.length; i += batchSize) {
            const batch = args.slice(i, i + batchSize)
            const batchResults = await Promise.all(
                batch.map(async (arg) => {
                    try {
                        return await func(arg)
                    } catch (error) {
                        console.error(`Error in multicall for arg ${arg}:`, error)
                        return 0n
                    }
                })
            )
            results.push(...batchResults)
        }
        
        return results
    }
} 