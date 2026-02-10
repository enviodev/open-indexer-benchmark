import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

// Get RPC endpoint from environment variable
const rpcEndpoint = process.env.RPC_ENDPOINT

export const processor = new EvmBatchProcessor()
    // Lookup archive by the network name in Subsquid registry
    // See https://docs.subsquid.io/evm-indexing/supported-networks/
    .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
    // Chain RPC endpoint is required for
    //  - indexing unfinalized blocks https://docs.subsquid.io/basics/unfinalized-blocks/
    //  - querying the contract state https://docs.subsquid.io/evm-indexing/query-state/
    .setRpcEndpoint({
        // Use RPC endpoint from environment variable
        url: assertNotNull(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
    })
    .setFinalityConfirmation(75)
    .setFields({
        block: {
            height: true,
            timestamp: true,
            hash: true,
            parentHash: true,
        },
    })
    .setBlockRange({
        from: 0,
        to:   100000
    })
    .includeAllBlocks({
        from: 0,
        to:   100000
    })
    .addTransaction({
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
