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

// The benchmark runner always supplies an end block; without one the indexer
// would silently run unbounded and the verification phase would never finish.
function requireEndBlock(): number {
  const value = Number(process.env.SQD_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "SQD_END_BLOCK must be set to the block to stop at (the benchmark runner sets it)"
    );
  }
  return value;
}

const CONTRACT_ADDRESS = '0xae78736cd615f374d3085123a210448e74fc6393'
const rpcEndpoint = process.env.RPC_ENDPOINT

// The benchmark measures the Squid SDK once per source it can read from, so
// the same project runs twice. `setGateway` is what points the processor at
// SQD Network; leaving it off is how SQD documents running on RPC alone, for
// chains its network does not cover. The RPC endpoint is configured either
// way — the gateway run still needs one for the unfinalised head.
const GATEWAY = 'https://v2.archive.subsquid.io/network/ethereum-mainnet'
const base = new EvmBatchProcessor()

export const processor = (process.env.SQD_SOURCE === 'rpc' ? base : base.setGateway(GATEWAY))
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
        to: requireEndBlock(),
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
