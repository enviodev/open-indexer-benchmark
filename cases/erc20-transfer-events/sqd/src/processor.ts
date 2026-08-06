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

const CONTRACT_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' // USDC
const rpcEndpoint = process.env.RPC_ENDPOINT

// The benchmark measures the Squid SDK once per source it can read from, so
// the same project runs twice and `SQD_SOURCE` picks the source. Each mode
// configures that source and nothing else: a processor given both falls back
// to RPC near the head, which would leave the SQD Network row measuring a
// mixture of the two rather than the network.
const GATEWAY = 'https://v2.archive.subsquid.io/network/ethereum-mainnet'

function withSource(processor: EvmBatchProcessor): EvmBatchProcessor {
    if (process.env.SQD_SOURCE === 'rpc') {
        // No gateway at all, so the RPC endpoint serves the whole sync. This is
        // the regime SQD documents for chains SQD Network does not cover, and
        // the one case where finality has to be settled from the chain itself.
        return processor
            .setRpcEndpoint({
                url: assertNotNull(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
            })
            .setFinalityConfirmation(75)
    }
    return processor.setGateway(GATEWAY)
}

export const processor = withSource(new EvmBatchProcessor())
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
        ],
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
