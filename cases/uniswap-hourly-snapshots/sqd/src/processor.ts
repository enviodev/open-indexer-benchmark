import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as poolAbi from './abi/UniswapV3Pool'
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

export const POOL_ADDRESS = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8' // USDC/WETH 0.3%
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
    // Only the header timestamp: the snapshot needs every block's hour, and
    // nothing else from the block.
    .setFields({
        block: {
            timestamp: true,
        },
    })
    .setBlockRange({
        from: 21_000_000,
        to: requireEndBlock(),
    })
    // The Squid SDK has no block handler or block stride. Without this the
    // batch would only hold blocks with a matching log, and an hour without a
    // swap would get no snapshot. Over RPC it means fetching every block.
    .includeAllBlocks({ from: 21_000_000 })
    .addLog({
        address: [POOL_ADDRESS],
        topic0: [poolAbi.events.Swap.topic],
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
