/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import {
  TransparentUpgradeableProxy,
  TransparentUpgradeableProxy_Transfer,
} from "generated";

TransparentUpgradeableProxy.Transfer.handler(async ({ event, context }) => {
  const entity: TransparentUpgradeableProxy_Transfer = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    from: event.params.from,
    to: event.params.to,
    value: event.params.value,
    blockNumber: BigInt(event.block.number),
    transactionHash: event.transaction.hash 
  };

  context.TransparentUpgradeableProxy_Transfer.set(entity);
});
