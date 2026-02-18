import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
    Trace as _Trace
} from '@subsquid/evm-processor'
import { UNISWAP_V2_ROUTER02 } from "./constant.js"

// Function signature for swapExactTokensForTokens (first 4 bytes of keccak256 hash)
const SWAP_EXACT_TOKENS_FOR_TOKENS_SIG = '0x38ed1739'

export const processor = new EvmBatchProcessor()
    // Lookup archive by the network name in Subsquid registry
    // See https://docs.subsquid.io/evm-indexing/supported-networks/
    .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
    // Chain RPC endpoint is required for
    //  - indexing unfinalized blocks https://docs.subsquid.io/basics/unfinalized-blocks/
    //  - querying the contract state https://docs.subsquid.io/evm-indexing/query-state/
    .setRpcEndpoint({
        // Set the URL via .env for local runs or via secrets when deploying to Subsquid Cloud
        // https://docs.subsquid.io/deploy-squid/env-variables/
        url: assertNotNull(require("dotenv").config().parsed.RPC_ENDPOINT, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable')
    })
    .setFinalityConfirmation(75)
    .setFields({
        block: {
            timestamp: true,
        },
        transaction: {
            hash: true,
            from: true,
            to: true,
        },
        trace: {
            callTo: true,
            callInput: true,
            type: true,
            error: true,
            transactionHash: true,
            transactionIndex: true,
        }
    })
    .setBlockRange({
        from: 22200000, // Set a reasonable block range for Uniswap V2 on Ethereum
        to:   22290000,
    })
    // Add trace for swapExactTokensForTokens function calls to the UniswapV2Router02 contract
    .addTrace({
        type: ['call'],
        callTo: [UNISWAP_V2_ROUTER02],
        transaction: true
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type Trace = _Trace<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
