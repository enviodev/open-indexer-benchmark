const axios = require('axios');
const { writeFileSync } = require('fs');
const { unlink } = require('fs/promises');
const parquet = require('parquetjs');

// Configuration
const SUBGRAPH_ENDPOINT = 'https://api.studio.thegraph.com/query/108520/case_3_ethereum_block/version/latest';
const OUTPUT_DIR = '/Users/yufeili/Desktop/sentio/indexer-benchmark/case_3_ethereum_block/data';
const BLOCKS_FILE = `${OUTPUT_DIR}/subgraph-case3-blocks.parquet`;
const BATCH_SIZE = 1000; // The Graph has a limit of 1000 results per query

// Define the schema for Ethereum blocks
const blockSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  number: { type: 'INT64' },
  hash: { type: 'UTF8' },
  parentHash: { type: 'UTF8' },
  timestamp: { type: 'INT64' }
});

// Fetch blocks within a specific number range
async function fetchSubgraphBlocksRange(startBlock, endBlock, writer) {
  console.log(`Fetching Subgraph blocks from ${startBlock} to ${endBlock}...`);
  
  try {
    // Parameters for pagination
    let totalRecords = 0;
    let lastBlockNumber = null;
    let hasMore = true;
    
    while (hasMore) {
      try {
        // Define the where filter based on current pagination state
        let whereClause = `number_gte: ${startBlock}, number_lte: ${endBlock}`;
        
        // Add cursor condition if we have a last block number
        if (lastBlockNumber !== null) {
          whereClause += `, number_gt: ${lastBlockNumber}`;
        }
        
        console.log(`Fetching ${BATCH_SIZE} blocks${lastBlockNumber !== null ? ` after block ${lastBlockNumber}` : ' from the beginning'}...`);
        
        // GraphQL query with cursor-based pagination
        const query = `
          query {
            blocks(
              first: ${BATCH_SIZE}
              where: { ${whereClause} }
              orderBy: number
              orderDirection: asc
            ) {
              id
              number
              hash
              parentHash
              timestamp
            }
          }
        `;
        
        const headers = {
          'Content-Type': 'application/json',
        };
        
        const response = await axios.post(
          SUBGRAPH_ENDPOINT,
          { query },
          {
            headers,
            timeout: 180000 // 3 minutes
          }
        );
        
        if (response.data && response.data.data && response.data.data.blocks) {
          const blocks = response.data.data.blocks;
          
          if (blocks.length === 0) {
            hasMore = false;
            console.log('No more blocks to fetch.');
            break;
          }
          
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
              
              // Update the cursor for next iteration
              lastBlockNumber = block.number;
            } catch (rowErr) {
              console.error(`Error processing block: ${JSON.stringify(block)}`, rowErr);
            }
          }
          
          console.log(`Processed ${blocks.length} blocks (up to block ${lastBlockNumber})`);
          
          if (blocks.length < BATCH_SIZE) {
            hasMore = false;
          }
        } else if (response.data && response.data.errors) {
          console.error('GraphQL errors:', response.data.errors);
          hasMore = false;
        } else {
          console.error('Invalid response format:', response.data);
          hasMore = false;
        }
      } catch (fetchErr) {
        console.error(`Error fetching blocks:`, fetchErr.message);
        
        // If we have already processed some blocks, continue with next batch
        // Otherwise fail completely
        if (totalRecords === 0) {
          throw fetchErr;
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

// Fetch blocks from Subgraph with pagination
async function fetchSubgraphBlocks() {
  console.log('Fetching Subgraph blocks...');
  
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
    
    // Get the maximum block number first
    const getMaxBlockQuery = `
      query {
        _meta {
          block {
            number
          }
        }
      }
    `;
    
    let maxBlock = 10000000; // Default fallback
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    try {
      const maxBlockResponse = await axios.post(
        SUBGRAPH_ENDPOINT,
        { query: getMaxBlockQuery },
        {
          headers,
          timeout: 60000 // 1 minute
        }
      );
      
      if (maxBlockResponse.data && 
          maxBlockResponse.data.data && 
          maxBlockResponse.data.data._meta && 
          maxBlockResponse.data.data._meta.block &&
          maxBlockResponse.data.data._meta.block.number) {
        maxBlock = parseInt(maxBlockResponse.data.data._meta.block.number);
        console.log(`Maximum block number: ${maxBlock}`);
      } else {
        console.warn('Could not determine maximum block number, using default of 10,000,000');
      }
    } catch (error) {
      console.warn('Error fetching maximum block number:', error.message);
    }
    
    let totalRecords = 0;
    
    // Fetch all blocks in batches of 200,000 to avoid overwhelming memory
    const batchSize = 200000;
    for (let startBlock = 0; startBlock <= maxBlock; startBlock += batchSize) {
      const endBlock = Math.min(startBlock + batchSize - 1, maxBlock);
      console.log(`Fetching blocks batch from ${startBlock} to ${endBlock}...`);
      totalRecords += await fetchSubgraphBlocksRange(startBlock, endBlock, writer);
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
    
    // Test connection to Subgraph endpoint
    const headers = {
      'Content-Type': 'application/json',
    };
    
    try {
      const testResponse = await axios.post(
        SUBGRAPH_ENDPOINT,
        { query: '{ _meta { block { number } } }' },
        { headers }
      );
      
      if (testResponse.data && testResponse.data.data && testResponse.data.data._meta) {
        console.log('Connection to Subgraph endpoint successful');
        console.log('Current block in subgraph:', testResponse.data.data._meta.block.number);
      } else {
        console.warn('Unexpected response from Subgraph:', testResponse.data);
      }
    } catch (err) {
      console.error('Error connecting to Subgraph endpoint:', err.message);
      throw err;
    }
    
    // Fetch and save blocks
    const blockCount = await fetchSubgraphBlocks();
    
    console.log('Data fetching complete!');
    console.log(`Total blocks: ${blockCount}`);
  } catch (error) {
    console.error('Error running the script:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 