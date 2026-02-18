import { LBTCContext, LBTCProcessor, TransferEvent } from './types/eth/lbtc.js'

import { LBTC_PROXY, } from "./constant.js"
import { Transfer } from './schema/schema.js'

let threadLocalEmitTime = 0;
let threadLocalUpsertTime = 0;
let threadLocalCount = 0;

const transferEventHandler = async function (event: TransferEvent, ctx: LBTCContext) {
  const transfer = new Transfer({
    id: `${ctx.chainId}_${event.blockNumber}_${event.index}`,
    from: event.args.from,
    to: event.args.to,
    value: event.args.value,
    blockNumber: BigInt(event.blockNumber),
    transactionHash: Buffer.from(event.transactionHash.slice(2), 'hex'),
  });
  const startEmit = performance.now();
  await ctx.eventLogger.emit('Transfer1', {transfer}); // 21:08:59 - 21:14:12 5m13s
  threadLocalEmitTime += performance.now() - startEmit; // 11:45:45 - 11:50:37 4m52s
  
  // const startUpsert = performance.now();
  // await ctx.store.upsert(transfer); // 21:37:43 - 21:43:32 5m49s
  // threadLocalUpsertTime += performance.now() - startUpsert; // 11:35:02 - 11:42:01 6m59s
  
  threadLocalCount++; // 23:30:56 - 23:37:58 7m2s emit 10s, upsert 3381.86s
  
  // Log periodically without atomic operations
  if (threadLocalCount % 1000 === 0) {
    console.log(`Thread local times (s) - Emit: ${(threadLocalEmitTime/1000).toFixed(2)}`);
    // console.log(`Thread local times (s) - Upsert: ${(threadLocalUpsertTime/1000).toFixed(2)}`);
  }
}

LBTCProcessor.bind({ address: LBTC_PROXY, 
    startBlock: 1, endBlock: 22200000 })
    .onEventTransfer(transferEventHandler) // if filter by mint LBTC Processor.filters.Transfer(0x0, null)
