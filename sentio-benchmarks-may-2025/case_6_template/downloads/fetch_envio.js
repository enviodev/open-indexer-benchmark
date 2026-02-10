const { GraphQLClient } = require('graphql-request');
const parquet = require('parquetjs');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const endpoint = 'http://localhost:8080/v1/graphql';
const graphQLClient = new GraphQLClient(endpoint, {
  headers: {
    'Content-Type': 'application/json',
    'X-Hasura-Admin-Secret': 'testing'
  }
});

const pairsQuery = `
  query GetPairs($skip: Int!) {
    Pair(limit: 1000, offset: $skip, order_by: {createdAt: asc}) {
      id
      token0
      token1
      createdAt
    }
  }
`;

const swapsQuery = `
  query GetSwaps($skip: Int!) {
    Swap(limit: 1000, offset: $skip, order_by: {blockNumber: asc}) {
      id
      pair
      sender
      to
      amount0In
      amount1In
      amount0Out
      amount1Out
      blockNumber
      timestamp
    }
  }
`;

async function writePairsToParquet(pairs) {
  const schema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    token0: { type: 'UTF8' },
    token1: { type: 'UTF8' },
    createdAt: { type: 'UTF8' }
  });

  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'envio_pairs.parquet'));

  for (const pair of pairs) {
    await writer.appendRow({
      id: pair.id,
      token0: pair.token0,
      token1: pair.token1,
      createdAt: pair.createdAt
    });
  }

  await writer.close();
}

async function writeSwapsToParquet(swaps) {
  const schema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    pair: { type: 'UTF8' },
    sender: { type: 'UTF8' },
    to: { type: 'UTF8' },
    amount0In: { type: 'UTF8' },
    amount1In: { type: 'UTF8' },
    amount0Out: { type: 'UTF8' },
    amount1Out: { type: 'UTF8' },
    blockNumber: { type: 'UTF8' },
    timestamp: { type: 'UTF8' }
  });

  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'envio_swaps.parquet'));

  for (const swap of swaps) {
    await writer.appendRow({
      id: swap.id,
      pair: swap.pair,
      sender: swap.sender,
      to: swap.to,
      amount0In: swap.amount0In,
      amount1In: swap.amount1In,
      amount0Out: swap.amount0Out,
      amount1Out: swap.amount1Out,
      blockNumber: swap.blockNumber,
      timestamp: swap.timestamp
    });
  }

  await writer.close();
}

async function fetchAndSaveData() {
  try {
    // First fetch pairs
    console.log('Fetching pairs...');
    let skip = 0;
    let allPairs = [];
    let hasMore = true;

    while (hasMore) {
      const variables = { skip };
      const result = await graphQLClient.request(pairsQuery, variables);
      const pairs = result.Pair;
      
      if (!pairs || pairs.length === 0) {
        hasMore = false;
      } else {
        allPairs = allPairs.concat(pairs);
        console.log(`Fetched ${pairs.length} pairs. Total: ${allPairs.length}`);
        skip += pairs.length;
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Total pairs fetched: ${allPairs.length}`);
    await writePairsToParquet(allPairs);
    console.log('Pairs data written to envio_pairs.parquet');

    // Then fetch swaps
    console.log('\nFetching swaps...');
    skip = 0;
    let allSwaps = [];
    hasMore = true;

    while (hasMore) {
      const variables = { skip };
      const result = await graphQLClient.request(swapsQuery, variables);
      const swaps = result.Swap;
      
      if (!swaps || swaps.length === 0) {
        hasMore = false;
      } else {
        allSwaps = allSwaps.concat(swaps);
        console.log(`Fetched ${swaps.length} swaps. Total: ${allSwaps.length}`);
        skip += swaps.length;
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Total swaps fetched: ${allSwaps.length}`);
    await writeSwapsToParquet(allSwaps);
    console.log('Swaps data written to envio_swaps.parquet');
  } catch (error) {
    console.error('Error:', error);
    if (error.response) {
      console.error('GraphQL Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

fetchAndSaveData(); 