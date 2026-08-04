import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import { TOPICS } from './abi/Safe'
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

// The canonical Safe proxy factories, grouped by ProxyCreation layout: 1.3.0
// carries `proxy` in the data payload, 1.4.1 onwards carries it in a topic.
export const FACTORIES_V1_3_0 = [
    '0xa6b71e26c5e0845f74c812102ca7114b6a896ab2', // canonical
    '0xc22834581ebc8527d974f8a1c97e1bea4ef910bc', // eip155
]
export const FACTORIES_MODERN = [
    '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67', // 1.4.1
    '0x14f2982d601c9458f93bd70b218933a6f8165e7b', // 1.5.0
]

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
    // Both generations share a topic0, so one subscription covers them; which
    // decoder a log needs is decided in the handler from the address it came
    // from.
    .addLog({
        address: [...FACTORIES_V1_3_0, ...FACTORIES_MODERN],
        topic0: [safeAbi.events.ProxyCreation.topic],
    })
    // The children are not known at configuration time and there is no address
    // list to give here, so SafeSetup is subscribed to chain-wide and the
    // handler discards logs from proxies these factories did not create. This
    // is the pattern SQD's own factory-contract guide describes.
    .addLog({
        topic0: [
            TOPICS.safeSetup,
            TOPICS.safeReceived,
            TOPICS.safeModuleTransaction,
            TOPICS.safeMultiSigTransaction,
            TOPICS.executionSuccess,
            TOPICS.executionFailure,
            TOPICS.changedThreshold,
            TOPICS.changedMasterCopy,
            TOPICS.changedFallbackHandler,
            TOPICS.changedGuard,
            TOPICS.changedModuleGuard,
            TOPICS.enabledModule,
            TOPICS.disabledModule,
            TOPICS.addedOwner,
            TOPICS.removedOwner,
        ],
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
