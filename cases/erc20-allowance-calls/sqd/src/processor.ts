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

export const processor = new EvmBatchProcessor()
    .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
    .setRpcEndpoint({
        url: assertNotNull(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
        // The allowance reads are the whole case, and the handler issues a
        // batch of them at once. The client's default of 10 requests in flight
        // would cap the run at 10 calls at a time however many the handler
        // hands it, leaving nine tenths of the endpoint idle; raised to the
        // endpoint's own ceiling so what limits the run is the endpoint rather
        // than the client's queue.
        capacity: 100,
    })
    .setFinalityConfirmation(75)
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

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
