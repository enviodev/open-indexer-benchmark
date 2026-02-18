const { writeFileSync } = require('fs');
const { unlink } = require('fs/promises');
const parquet = require('parquetjs');
const fetch = require('node-fetch');

// Configuration
const PONDER_GRAPHQL_ENDPOINT = 'http://localhost:42069';
const OUTPUT_DIR = '/Users/yufeili/Desktop/sentio/indexer-benchmark/case_3_ethereum_block/data';
const BLOCKS_FILE = `${OUTPUT_DIR}/ponder-case3-blocks.parquet`;

// Define the schema for Ethereum blocks
const blockSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  number: { type: 'INT64' },
  hash: { type: 'UTF8' },
  parentHash: { type: 'UTF8' },
  timestamp: { type: 'INT64' },
  // Add more fields as needed
});

// Fetch blocks from Ponder with pagination for a specific range
async function fetchPonderBlocksRange(startBlock, endBlock, writer) {
  console.log(`Fetching Ponder blocks from ${startBlock} to ${endBlock}...`);
  
  try {
    // Parameters for pagination
    const pageSize = 100;
    let offset = 0;
    let hasMore = true;
    let totalRecords = 0;
    
    while (hasMore) {
      try {
        console.log(`Fetching blocks from offset ${offset}...`);
        
        // GraphQL query with pagination 
        // Note: Removing the number filter since it might be causing issues
        const query = `
          query {
            blocks(
              limit: ${pageSize}
              offset: ${offset}
              orderBy: { number: "asc" }
            ) {
              items {
                id
                number
                hash
                parentHash
                timestamp
              }
              totalCount
            }
          }
        `;
        
        const response = await fetch(PONDER_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query }),
        });
        
        const result = await response.json();
        
        if (!result.data || !result.data.blocks || !result.data.blocks.items || result.data.blocks.items.length === 0) {
          hasMore = false;
          console.log('No more blocks to fetch.');
          break;
        }
        
        const blocks = result.data.blocks.items;
        
        // Process and write blocks to parquet
        for (const block of blocks) {
          try {
            if (block.number === null || block.hash === null) {
              continue;
            }
            
            // Filter blocks by number range here instead of in the query
            const blockNum = parseInt(block.number);
            if (blockNum < startBlock || blockNum > endBlock) {
              continue;
            }
            
            // Create a record in the right format
            const record = {
              id: block.id,
              number: BigInt(block.number),
              hash: block.hash,
              parentHash: block.parentHash || '',
              timestamp: BigInt(block.timestamp || 0)
            };
            
            await writer.appendRow(record);
            totalRecords++;
          } catch (rowErr) {
            console.error(`Error processing block: ${JSON.stringify(block)}`, rowErr);
          }
        }
        
        console.log(`Processed ${blocks.length} blocks from offset ${offset}`);
        offset += blocks.length;
        
        if (blocks.length < pageSize) {
          hasMore = false;
        }
      } catch (fetchErr) {
        console.error(`Error fetching blocks at offset ${offset}:`, fetchErr.message);
        if (offset === 0) {
          throw fetchErr; // Fail if we can't even fetch the first page
        }
        hasMore = false;
      }
    }
    
    console.log(`Total blocks fetched for range ${startBlock}-${endBlock}: ${totalRecords}`);
    return totalRecords;
  } catch (error) {
    console.error(`Error fetching blocks for range ${startBlock}-${endBlock}:`, error);
    throw error;
  }
}

// Fetch specific ranges of blocks
async function fetchPonderBlocks() {
  console.log('Fetching Ponder blocks...');
  
  try {
    // Delete existing file
    try {
      await unlink(BLOCKS_FILE);
      console.log(`Deleted existing file: ${BLOCKS_FILE}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    
    // Create a writer
    const writer = await parquet.ParquetWriter.openFile(blockSchema, BLOCKS_FILE);
    
    // Get total count first
    const totalCountQuery = `
      query {
        blocks(limit: 1) {
          totalCount
        }
      }
    `;
    
    const totalCountResponse = await fetch(PONDER_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: totalCountQuery }),
    });
    
    const totalCountResult = await totalCountResponse.json();
    const totalCount = totalCountResult.data?.blocks?.totalCount || 0;
    
    console.log(`Total blocks available: ${totalCount}`);
    
    // Use pagination with cursor-based pagination
    // Since the API doesn't support offset, we'll use limit and after parameters
    const pageSize = 100;
    let hasMore = true;
    let cursor = null;
    let totalRecords = 0;
    
    while (hasMore) {
      // Build the query
      let queryString = `
        query {
          blocks(
            limit: ${pageSize}
            orderBy: "number"
            orderDirection: "asc"
      `;
      
      // Add the cursor if we have one
      if (cursor) {
        queryString += `
            after: "${cursor}"
        `;
      }
      
      // Close the query
      queryString += `
          ) {
            items {
              id
              number
              hash
              parentHash
              timestamp
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      `;
      
      try {
        console.log(`Fetching batch of blocks...${cursor ? ` (after: ${cursor})` : ''}`);
        
        const response = await fetch(PONDER_GRAPHQL_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: queryString }),
        });
        
        const result = await response.json();
        
        if (result.errors) {
          console.error('GraphQL errors:', result.errors);
          hasMore = false;
          break;
        }
        
        if (!result.data || !result.data.blocks || !result.data.blocks.items || result.data.blocks.items.length === 0) {
          console.log('No more blocks to fetch.');
          hasMore = false;
          break;
        }
        
        const blocks = result.data.blocks.items;
        const pageInfo = result.data.blocks.pageInfo;
        
        let batchProcessed = 0;
        
        // Process and write blocks to parquet
        for (const block of blocks) {
          try {
            if (block.number === null || block.hash === null) {
              continue;
            }
            
            // Create a record in the right format
            const record = {
              id: block.id,
              number: BigInt(block.number),
              hash: block.hash,
              parentHash: block.parentHash || '',
              timestamp: BigInt(block.timestamp || 0)
            };
            
            await writer.appendRow(record);
            totalRecords++;
            batchProcessed++;
          } catch (rowErr) {
            console.error(`Error processing block: ${JSON.stringify(block)}`, rowErr);
          }
        }
        
        console.log(`Processed ${batchProcessed} blocks`);
        
        // Check if there are more pages
        hasMore = pageInfo.hasNextPage;
        
        // Update the cursor for the next batch
        if (hasMore && pageInfo.endCursor) {
          cursor = pageInfo.endCursor;
        } else {
          hasMore = false;
        }
        
      } catch (fetchErr) {
        console.error('Error fetching blocks:', fetchErr.message);
        hasMore = false;
      }
    }
    
    // If no blocks were processed, write a dummy record
    if (totalRecords === 0) {
      console.warn('No blocks were processed, writing a dummy record');
      await writer.appendRow({
        id: '0',
        number: BigInt(0),
        hash: 'dummy',
        parentHash: 'dummy',
        timestamp: BigInt(0)
      });
    }
    
    await writer.close();
    console.log(`Total blocks fetched: ${totalRecords}`);
    return totalRecords;
  } catch (error) {
    console.error('Error fetching blocks:', error);
    throw error;
  }
}

// Main function to test
async function main() {
  try {
    // Make sure output directory exists
    try {
      writeFileSync(`${OUTPUT_DIR}/.gitkeep`, '');
    } catch (err) {
      console.error('Error creating output directory:', err);
    }
    
    // Test GraphQL connection
    const testQuery = '{ _meta { status } }';
    const testResponse = await fetch(PONDER_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: testQuery }),
    });
    
    const testResult = await testResponse.json();
    if (testResult.data && testResult.data._meta) {
      console.log('Connection to Ponder GraphQL successful');
    } else {
      throw new Error('Failed to connect to Ponder GraphQL endpoint');
    }
    
    // Fetch and save blocks
    const blockCount = await fetchPonderBlocks();
    
    console.log('Data fetching complete!');
    console.log(`Total blocks: ${blockCount}`);
  } catch (error) {
    console.error('Error running the script:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 