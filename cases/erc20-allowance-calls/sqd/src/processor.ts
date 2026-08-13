import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import {RpcClient} from '@subsquid/rpc-client'
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

/** The eight tokens the case indexes approvals on. */
const CONTRACT_ADDRESSES = [
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    '0x68749665ff8d2d112fa859aa293f07a622782f38', // XAUt
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    '0x4c9edd5852cd905f086c759e8383e09bff1e68b3', // USDe
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
    '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e', // crvUSD
]

const rpcEndpoint = process.env.RPC_ENDPOINT

// The benchmark measures the Squid SDK once per source it can read from, so
// the same project runs twice and `SQD_SOURCE` picks the source.
const GATEWAY = 'https://v2.archive.subsquid.io/network/ethereum-mainnet'

function withSource(processor: EvmBatchProcessor): EvmBatchProcessor {
    // Unlike the other cases, the RPC endpoint is configured in both modes:
    // this case's handler reads contract state, and those reads have to go
    // somewhere whichever source the chain data comes from.
    //
    const withRpc = processor
        .setRpcEndpoint({
            url: assertNotNull(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
        })
        .setFinalityConfirmation(75)

    if (process.env.SQD_SOURCE === 'rpc') {
        // No gateway at all, so the RPC endpoint serves the sync as well as the
        // calls. This is the regime SQD documents for chains SQD Network does
        // not cover.
        return withRpc
    }
    return withRpc.setGateway(GATEWAY)
}

export const processor = withSource(new EvmBatchProcessor())
    .setFields({
        block: {
            timestamp: true,
        },
    })
    .setBlockRange({
        from: 25_600_000,
        to: requireEndBlock(),
    })
    .addLog({
        address: CONTRACT_ADDRESSES,
        topic0: [erc20Abi.events.Approval.topic],
    })

/**
 * The client the handler makes its allowance reads through.
 *
 * The generated contract binding sends one HTTP request per read, which for a
 * batch of thousands costs more in sockets than the round trips it is waiting
 * on. This client's `batchCall` merges them into JSON-RPC batches of up to a
 * thousand instead, `capacity` requests of them in flight at a time — the same
 * calls, at the same blocks, carried by a couple of dozen requests rather than
 * thousands.
 *
 * Batching is not aggregation: each read is still its own `eth_call` at its own
 * block, which is what the endpoint holds for 200ms and counts.
 */
export const rpcClient = new RpcClient({
    url: assertNotNull(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
    capacity: 20,
    maxBatchCallSize: 1000,
})

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
