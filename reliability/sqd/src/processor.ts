import { assertNotNull } from "@subsquid/util-internal";
import {
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  Log as _Log,
  Transaction as _Transaction,
} from "@subsquid/evm-processor";
import { RpcClient } from "@subsquid/rpc-client";
import * as erc20Abi from "./abi/ERC20";
import * as dotenv from "dotenv";

dotenv.config();

// The harness always supplies an end block, the same way the throughput runner
// does. It is a block no scenario reaches - the suite is about what happens at
// the head - so this runs as an open-ended head follower. The variable is
// still required rather than defaulted: a processor silently running unbounded
// looks exactly like a working one.
function requireEndBlock(): number {
  const value = Number(process.env.SQD_END_BLOCK);
  if (!Number.isInteger(value)) {
    throw new Error(
      "SQD_END_BLOCK must be set to the block to stop at (the harness sets it)"
    );
  }
  return value;
}

export const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000c0ffee";
export const START_BLOCK = 1_000_000;

const rpcEndpoint = assertNotNull(
  process.env.RPC_ENDPOINT,
  "No RPC endpoint supplied - set RPC_ENDPOINT environment variable"
);

/**
 * The client the token metadata is read through.
 *
 * Reliability is only measured over RPC - the benchmark cannot make SQD
 * Network reorg or fail on demand - so there is no gateway here at all, and
 * this is the regime SQD documents for chains its network does not cover.
 * `setFinalityConfirmation` is what decides how far back the processor will
 * unwind when the chain rewrites itself, which is most of what the reorg
 * scenarios are asking about.
 */
export const rpcClient = new RpcClient({ url: rpcEndpoint });

export const processor = new EvmBatchProcessor()
  .setRpcEndpoint({ url: rpcEndpoint })
  // The processor looks for a new head every five seconds unless told
  // otherwise, which on this chain's two-second blocks is a median of two and
  // a half seconds before it has even seen a block. An operator on a fast
  // chain sets this; one second is what Ponder polls at out of the box.
  //
  // newHeadTimeout is the same kind of setting for a WebSocket endpoint: how
  // long a subscription may go without announcing a block before the
  // processor resets the connection. Its default is never, and a subscription
  // that goes quiet without closing then stops the processor for good - which
  // is what its documentation sets this for. Five blocks of silence.
  .setRpcDataIngestionSettings({ headPollInterval: 1_000, newHeadTimeout: 10_000 })
  .setFinalityConfirmation(10)
  .setFields({
    log: { transactionHash: true },
  })
  .setBlockRange({
    from: START_BLOCK,
    to: requireEndBlock(),
  })
  .addLog({
    address: [CONTRACT_ADDRESS],
    // Both events. A project configured for one of them cannot be asked
    // whether it would have indexed the other.
    topic0: [erc20Abi.events.Transfer.topic, erc20Abi.metadataEvents.MetadataUpdated.topic],
  });

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
