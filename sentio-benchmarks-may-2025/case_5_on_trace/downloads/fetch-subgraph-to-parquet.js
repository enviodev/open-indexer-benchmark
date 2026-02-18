// Script to fetch subgraph entities from the GraphQL endpoint and write to Parquet
const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');
const fetch = require('node-fetch');

// Configuration
const BATCH_SIZE = 1000; // Number of entities to fetch per request
const OUTPUT_PATH = path.resolve(__dirname, 'subgraph.parquet');
const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/108520/case_5_on_trace/version/latest';

// Define Parquet schema based on our entity structure - use STRING for large numbers
const schema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' }, // Block numbers are within a safe range
  transactionHash: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  amountIn: { type: 'UTF8' }, // Use UTF8 instead of INT64 for potentially large values
  amountOutMin: { type: 'UTF8' }, // Use UTF8 instead of INT64 for potentially large values
  deadline: { type: 'UTF8' }, // Use UTF8 instead of INT64 for potentially large values
  path: { type: 'UTF8' },
  pathLength: { type: 'INT32' }
});

// Function to fetch swaps with cursor-based pagination
async function fetchSwaps(lastId = "") {
  const whereClause = lastId ? `where: { id_gt: "${lastId}" }` : "";
  console.log(`Fetching swaps (after ID: ${lastId || 'START'})...`);
  
  const query = `{
    swaps(first: ${BATCH_SIZE}, orderBy: id, orderDirection: asc, ${whereClause}) {
      id
      blockNumber
      transactionHash
      from
      to
      amountIn
      amountOutMin
      deadline
      path
      pathLength
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
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  
  return result.data.swaps;
}

// Main function to fetch all swaps and write to Parquet
async function main() {
  try {
    console.log(`Fetching data from ${SUBGRAPH_URL}...`);
    
    // Create Parquet file
    const writer = await parquet.ParquetWriter.openFile(schema, OUTPUT_PATH);
    
    let hasMore = true;
    let lastId = "";
    let totalCount = 0;
    
    // Fetch data in batches
    while (hasMore) {
      const swaps = await fetchSwaps(lastId);
      
      if (swaps.length === 0) {
        hasMore = false;
        continue;
      }
      
      // Process and write each swap
      for (const swap of swaps) {
        // Convert values appropriately, using strings for large numbers
        const row = {
          id: swap.id,
          blockNumber: BigInt(swap.blockNumber),
          transactionHash: swap.transactionHash,
          from: swap.from,
          to: swap.to,
          amountIn: swap.amountIn.toString(), // Store as string to avoid overflow
          amountOutMin: swap.amountOutMin.toString(), // Store as string to avoid overflow
          deadline: swap.deadline.toString(), // Store as string to avoid overflow
          path: swap.path,
          pathLength: parseInt(swap.pathLength, 10)
        };
        
        await writer.appendRow(row);
      }
      
      totalCount += swaps.length;
      console.log(`Processed ${swaps.length} swaps (total: ${totalCount})`);
      
      // Update the cursor to the last ID
      lastId = swaps[swaps.length - 1].id;
      
      // If we got fewer results than the batch size, we've reached the end
      if (swaps.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
    
    await writer.close();
    console.log(`Successfully wrote ${totalCount} swaps to ${OUTPUT_PATH}`);
    
  } catch (err) {
    console.error('Error fetching and processing subgraph data:', err);
  }
}

// Run the script
main(); 