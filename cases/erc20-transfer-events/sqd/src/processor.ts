import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as erc20Abi from './abi/ERC20'
import * as dotenv from 'dotenv'

dotenv.config()

const CONTRACT_ADDRESS = '0xae78736cd615f374d3085123a210448e74fc6393'
const rpcEndpoint = process.env.RPC_ENDPOINT

export const processor = new EvmBatchProcessor()
    .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
    .setRpcEndpoint({
        url: assertNotNull(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
    })
    .setFinalityConfirmation(75)
    .setFields({
        block: {
            timestamp: true,
        },
        log: {
            transactionHash: true,
        },
    })
    .setBlockRange({
        from: 18_600_000,
    })
    .addLog({
        address: [CONTRACT_ADDRESS],
        topic0: [
            erc20Abi.events.Transfer.topic,
            erc20Abi.events.Approval.topic,
        ],
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
