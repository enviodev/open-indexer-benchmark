const axios = require('axios');
const { writeFileSync } = require('fs');
const { unlink } = require('fs/promises');
const parquet = require('parquetjs');

// Configuration
const SENTIO_API_KEY = 'hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl';
const SENTIO_BASE_URL = 'https://app.sentio.xyz/api/v1/analytics/yufei/case_3_ethereum_block/sql/execute';
const OUTPUT_DIR = '/Users/yufeili/Desktop/sentio/indexer-benchmark/case_3_ethereum_block/data';
const BLOCKS_FILE = `${OUTPUT_DIR}/sentio-case3-blocks.parquet`;

// Define the schema for Ethereum blocks
const blockSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  number: { type: 'INT64' },
  hash: { type: 'UTF8' },
  parentHash: { type: 'UTF8' },
  timestamp: { type: 'INT64' }
});

// Fetch blocks from Sentio with pagination
async function fetchSentioBlocks() {
  console.log('Fetching Sentio blocks...');
  
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
    
    // Get total number of blocks first
    console.log('Getting total block count...');
    const countQuery = `SELECT COUNT(*) as total FROM \`Block\``;
    
    try {
      const countResponse = await axios.post(
        SENTIO_BASE_URL,
        {
          sqlQuery: {
            sql: countQuery
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': SENTIO_API_KEY
          },
          timeout: 60000 // 1 minute
        }
      );
      
      if (countResponse.data && countResponse.data.result && countResponse.data.result.rows && countResponse.data.result.rows.length > 0) {
        const totalCount = countResponse.data.result.rows[0].total;
        console.log(`Total blocks in Sentio: ${totalCount}`);
      }
    } catch (error) {
      console.warn('Error fetching total block count:', error.message);
    }
    
    // Use pagination to fetch all blocks
    const pageSize = 5000; // Larger page size for faster fetching
    let offset = 0;
    let hasMore = true;
    let totalRecords = 0;
    let lastNumber = -1;
    
    while (hasMore) {
      try {
        console.log(`Fetching blocks with offset ${offset}...`);
        
        // SQL query with pagination
        const sql = `
          SELECT 
            number, 
            hash, 
            parentHash, 
            timestamp
          FROM 
            \`Block\`
          ORDER BY 
            number ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `;
        
        const response = await axios.post(
          SENTIO_BASE_URL,
          {
            sqlQuery: {
              sql: sql
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'api-key': SENTIO_API_KEY
            },
            timeout: 180000 // 3 minutes
          }
        );
        
        if (response.data && response.data.result && response.data.result.rows) {
          const blocks = response.data.result.rows;
          
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
                id: block.number.toString(),
                number: BigInt(block.number),
                hash: block.hash,
                parentHash: block.parentHash || '',
                timestamp: BigInt(block.timestamp || 0)
              };
              
              await writer.appendRow(record);
              totalRecords++;
              lastNumber = block.number;
            } catch (rowErr) {
              console.error(`Error processing block: ${JSON.stringify(block)}`, rowErr);
            }
          }
          
          console.log(`Processed ${blocks.length} blocks from offset ${offset} (up to block ${lastNumber})`);
          offset += blocks.length;
          
          if (blocks.length < pageSize) {
            hasMore = false;
          }
        } else if (response.data && response.data.error) {
          console.error('API returned an error:', response.data.error);
          hasMore = false;
        } else {
          console.error('Invalid response format:', response.data);
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
    
    // Test connection to Sentio
    try {
      const testResponse = await axios.post(
        SENTIO_BASE_URL,
        {
          sqlQuery: {
            sql: 'SELECT 1'
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-key': SENTIO_API_KEY
          }
        }
      );
      
      if (testResponse.status !== 200) {
        throw new Error(`Failed to connect to Sentio API: ${testResponse.status}`);
      }
      
      console.log('Connection to Sentio API successful');
    } catch (error) {
      console.error('Error connecting to Sentio API:', error.message);
      process.exit(1);
    }
    
    // Fetch and save blocks
    const blockCount = await fetchSentioBlocks();
    
    console.log('Data fetching complete!');
    console.log(`Total blocks: ${blockCount}`);
  } catch (error) {
    console.error('Error running the script:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 