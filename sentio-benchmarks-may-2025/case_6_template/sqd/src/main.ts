// main.js
// This is the main executable of the squid indexer.

// EvmBatchProcessor is the class responsible for data retrieval and processing.
import {EvmBatchProcessor} from '@subsquid/evm-processor'
// TypeormDatabase is the class responsible for data storage.
import {TypeormDatabase} from '@subsquid/typeorm-store'
// usdcAbi is a utility module generated from the JSON ABI of the USDC contract.
// It contains methods for event decoding, direct RPC queries and some useful
// constants.
import * as usdcAbi from './abi/usdc'
import { Pair, UniswapV2Event } from './model/generated';
import { events as UniswapV2FactoryEvents } from './types/eth/UniswapV2Factory';
import { events as UniswapV2PairEvents } from './types/eth/UniswapV2Pair';
import { assertNotNull } from '@subsquid/util-internal'
import { ethers } from 'ethers'
import { Store } from '@subsquid/typeorm-store'
import { config as dotenvConfig } from 'dotenv'

// Keep track of legitimate pair addresses
const validPairs = new Set<string>();
dotenvConfig({ path: '.env' });
// Create RPC provider
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// First we configure data retrieval.
const processor = new EvmBatchProcessor()
  .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
  .setRpcEndpoint({
    url: assertNotNull(
      'https://rpc.sentio.xyz/oTSQQwOgzr9ERJ0petpRSbgkQDCPJ9Al/ethereum',
      'Required env variable RPC_ENDPOINT is missing'
    )
  })
  .setFinalityConfirmation(75)
  .setFields({
    block: {
      height: true,
      timestamp: true,
    },
    transaction: {
      hash: true,
      from: true,
      value: true,
    },
    log: {
      data: true,
      topics: true,
    }
  })
  .setBlockRange({ from: 19000000, to: 19010000 })
  // Listen to factory events
  .addLog({
    address: ['0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'],
    topic0: [UniswapV2FactoryEvents.PairCreated.topic],
    transaction: true,
    transactionLogs: false,
  })
  .addLog({
    topic0: [UniswapV2PairEvents.Swap.topic],
    transaction: true,
    transactionLogs: false,
  });

// TypeormDatabase objects store the data to Postgres. They are capable of
// handling the rollbacks that occur due to blockchain forks.
//
// There are also Database classes for storing data to files and BigQuery
// datasets.
const db = new TypeormDatabase({supportHotBlocks: true})

// The processor.run() call executes the data processing. Its second argument is
// the handler function that is executed once on each batch of data. Processor
// object provides the data via "ctx.blocks". However, the handler can contain
// arbitrary TypeScript code, so it's OK to bring in extra data from IPFS,
// direct RPC calls, external APIs etc.
processor.run(db, async (ctx) => {
  console.log(`Processing batch of ${ctx.blocks.length} blocks`);

  // Create maps to store entities for batch insertion
  const pairsToSave = new Map<string, Pair>();
  const eventsToSave: UniswapV2Event[] = [];

  for (let block of ctx.blocks) {
    for (let log of block.logs) {
      if (log.address.toLowerCase() === '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f'.toLowerCase()) {
        // Handle PairCreated event
        const event = UniswapV2FactoryEvents.PairCreated.decode(log);
        if (!event) continue;

        // Add to valid pairs set
        validPairs.add(event.pair.toLowerCase());

        // Store pair for batch insertion
        const pair = new Pair({
          id: event.pair,
          token0: event.token0,
          token1: event.token1,
          createdAt: BigInt(block.header.height),
        });
        pairsToSave.set(event.pair, pair);
      } else if (validPairs.has(log.address.toLowerCase())) {
        const event = UniswapV2PairEvents.Swap.decode(log);
        if (!event) continue;

        // Store event for batch insertion
        const uniswapEvent = new UniswapV2Event({
          id: `${log.transaction?.hash}-${log.logIndex}`,
          pair: log.address,
          sender: event.sender,
          to: event.to,
          amount0In: event.amount0In,
          amount0Out: event.amount0Out,
          amount1In: event.amount1In,
          amount1Out: event.amount1Out,
          timestamp: BigInt(block.header.timestamp),
          blockNumber: BigInt(block.header.height),
        });
        eventsToSave.push(uniswapEvent);
      }
    }

    // Save all pairs and events at the end of each block
    if (pairsToSave.size > 0) {
      await ctx.store.insert([...pairsToSave.values()]);
      pairsToSave.clear();
    }
    if (eventsToSave.length > 0) {
      await ctx.store.insert(eventsToSave);
      eventsToSave.length = 0;
    }
  }
})
