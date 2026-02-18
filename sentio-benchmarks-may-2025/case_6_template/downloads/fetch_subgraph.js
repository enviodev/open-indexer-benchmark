const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');
const fetch = require('node-fetch');

// Define paths
const dataDir = path.join(__dirname, '..', 'data');
const BATCH_SIZE = 1000;
const SWAPS_OUTPUT_PATH = path.join(dataDir, 'subgraph_swaps.parquet');
const PAIRS_OUTPUT_PATH = path.join(dataDir, 'subgraph_pairs.parquet');
const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/108520/case_6_template/version/latest';

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Define the schema for pairs
const pairsSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  token0: { type: 'UTF8' },
  token1: { type: 'UTF8' },
  createdAt: { type: 'INT64' }
});

// Define the schema for swaps
const swapsSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  amount0In: { type: 'DOUBLE' },
  amount0Out: { type: 'DOUBLE' },
  amount1In: { type: 'DOUBLE' },
  amount1Out: { type: 'DOUBLE' },
  blockNumber: { type: 'INT64' },
  pair: { type: 'UTF8' },
  sender: { type: 'UTF8' },
  timestamp: { type: 'INT64' },
  to: { type: 'UTF8' }
});

async function fetchPairs() {
  console.log('\nFetching pairs data...');
  let totalPairs = 0;
  let writer = null;

  try {
    writer = await parquet.ParquetWriter.openFile(pairsSchema, PAIRS_OUTPUT_PATH);
    console.log('Created pairs Parquet writer');

    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const query = `{
          pairs(
            first: ${BATCH_SIZE}
            skip: ${skip}
            orderBy: createdAt
            orderDirection: asc
          ) {
    id
    token0
    token1
    createdAt
          }
      }`;

      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      const pairs = result.data.pairs;
      if (pairs.length === 0) {
        hasMore = false;
        continue;
      }

      for (const pair of pairs) {
        await writer.appendRow({
          id: pair.id,
          token0: pair.token0,
          token1: pair.token1,
          createdAt: parseInt(pair.createdAt)
        });
      }

      totalPairs += pairs.length;
      console.log(`Fetched ${pairs.length} pairs (total: ${totalPairs})`);

      if (pairs.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        skip += BATCH_SIZE;
        if (skip >= 5000) {
          console.log('Reached skip limit of 5000, stopping pairs fetch');
          hasMore = false;
        }
      }
    }

    await writer.close();
    console.log(`Successfully wrote ${totalPairs} pairs to ${PAIRS_OUTPUT_PATH}`);
    return totalPairs;
  } catch (error) {
    console.error('Error fetching pairs:', error);
    if (writer) {
      await writer.close();
    }
    throw error;
  }
}

async function fetchSwaps() {
  console.log('\nFetching swaps data...');
  const writer = await parquet.ParquetWriter.openFile(swapsSchema, SWAPS_OUTPUT_PATH);
  console.log('Created swaps Parquet writer');

  let totalEvents = 0;
  let lastId = '';
  let lastBlockNumber = 19000000;
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 3;
  const seenIds = new Set();

  while (hasMore && retryCount < maxRetries) {
    try {
      const whereCondition = lastId ? 
        `where: {id_gt: "${lastId}", blockNumber_gte: ${lastBlockNumber}, blockNumber_lte: 19010000}` : 
        `where: {blockNumber_gte: ${lastBlockNumber}, blockNumber_lte: 19010000}`;

      const query = `{
          uniswapV2Events(
            first: ${BATCH_SIZE},
            ${whereCondition},
            orderBy: id,
            orderDirection: asc
          ) {
            id
            timestamp
            blockNumber
            pair {
              id
            }
      sender
      to
      amount0In
      amount0Out
      amount1In
      amount1Out
        }
      }`;

      const response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

      const result = await response.json();
      
      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        throw new Error('GraphQL query failed');
      }

      const swaps = result.data.uniswapV2Events;
      const eventsInBatch = swaps.length;
      
      if (eventsInBatch === 0) {
        hasMore = false;
        continue;
      }

      for (const swap of swaps) {
        if (seenIds.has(swap.id)) {
          console.log(`Skipping duplicate swap: ${swap.id}`);
          continue;
        }
          seenIds.add(swap.id);

          await writer.appendRow({
                    id: swap.id,
          amount0In: parseFloat(swap.amount0In),
          amount0Out: parseFloat(swap.amount0Out),
          amount1In: parseFloat(swap.amount1In),
          amount1Out: parseFloat(swap.amount1Out),
            blockNumber: parseInt(swap.blockNumber),
            pair: swap.pair.id,
                    sender: swap.sender,
          timestamp: parseInt(swap.timestamp),
          to: swap.to
        });

          totalEvents++;
      }

      console.log(`Processed ${eventsInBatch} swaps (total: ${totalEvents})`);
      lastId = swaps[swaps.length - 1].id;

      if (eventsInBatch < BATCH_SIZE) {
        hasMore = false;
      }

      retryCount = 0;
    } catch (error) {
      console.error('Error fetching swaps:', error);
      retryCount++;
      if (retryCount >= maxRetries) {
        throw error;
      }
      console.log(`Retrying... (attempt ${retryCount} of ${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }

  await writer.close();
  console.log(`Successfully wrote ${totalEvents} swaps to ${SWAPS_OUTPUT_PATH}`);
  return totalEvents;
}

async function main() {
  try {
    // Delete existing files if they exist
    if (fs.existsSync(PAIRS_OUTPUT_PATH)) {
      fs.unlinkSync(PAIRS_OUTPUT_PATH);
      console.log('Deleted existing pairs file');
    }
    if (fs.existsSync(SWAPS_OUTPUT_PATH)) {
      fs.unlinkSync(SWAPS_OUTPUT_PATH);
      console.log('Deleted existing swaps file');
    }

    const pairsCount = await fetchPairs();
    console.log(`\nFetched ${pairsCount} pairs`);

    const swapsCount = await fetchSwaps();
    console.log(`\nFetched ${swapsCount} swaps`);

    console.log('\nData export completed successfully!');
  } catch (error) {
    console.error('Error in main:', error);
    process.exit(1);
  }
}

main();