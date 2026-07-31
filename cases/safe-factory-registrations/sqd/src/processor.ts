import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as safeAbi from './abi/Safe'
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

const SAFE_PROXY_FACTORY = '0xa6b71e26c5e0845f74c812102ca7114b6a896ab2' // Safe proxy factory v1.3.0
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
        from: 24_600_000,
        to: requireEndBlock(),
    })
    .addLog({
        address: [SAFE_PROXY_FACTORY],
        topic0: [safeAbi.events.ProxyCreation.topic],
    })
    // The children are not known at configuration time and there is no address
    // list to give here, so SafeSetup is subscribed to chain-wide and the
    // handler discards logs from proxies this factory did not create. This is
    // the pattern SQD's own factory-contract guide describes.
    .addLog({
        topic0: [safeAbi.events.SafeSetup.topic],
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
