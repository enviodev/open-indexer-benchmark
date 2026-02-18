const { Pool } = require('pg');
const { writeFileSync } = require('fs');
const { unlink } = require('fs/promises');
const parquet = require('parquetjs');

// Configuration
const SUBSQUID_DB_HOST = 'pg.squid.subsquid.io';
const SUBSQUID_DB_NAME = '16308_7o1pyf';
const SUBSQUID_DB_USER = '16308_7o1pyf';
const SUBSQUID_DB_PASSWORD = 'Zl8V~c1b3i.MPbFIeJoLsO3zRcu6T7g_';
const OUTPUT_DIR = '/Users/yufeili/Desktop/sentio/indexer-benchmark/case_3_ethereum_block/data';
const BLOCKS_FILE = `${OUTPUT_DIR}/subsquid-case3-blocks.parquet`;

// Define the schema for Ethereum blocks
const blockSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  number: { type: 'INT64' },
  hash: { type: 'UTF8' },
  parentHash: { type: 'UTF8' },
  timestamp: { type: 'INT64' },
  // Add more fields as needed
});

// Initialize PostgreSQL connection
const pool = new Pool({
  host: SUBSQUID_DB_HOST,
  database: SUBSQUID_DB_NAME,
  user: SUBSQUID_DB_USER,
  password: SUBSQUID_DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

// Fetch blocks from Subsquid with pagination for a specific range
async function fetchSubsquidBlocksRange(startBlock, endBlock, writer) {
  console.log(`Fetching Subsquid blocks from ${startBlock} to ${endBlock}...`);
  
  try {
    // Parameters for pagination
    const pageSize = 10000; // Increased page size for efficiency
    let offset = 0;
    let hasMore = true;
    let totalRecords = 0;
    
    // Get count of blocks in this range first
    const countQuery = `
      SELECT COUNT(*) as count
      FROM block
      WHERE number >= ${startBlock} AND number <= ${endBlock}
    `;
    
    const countResult = await pool.query(countQuery);
    const blockCount = parseInt(countResult.rows[0].count);
    console.log(`Found ${blockCount.toLocaleString()} blocks in range ${startBlock}-${endBlock}`);
    
    // If no blocks in range, exit early
    if (blockCount === 0) {
      console.log(`No blocks found in range ${startBlock}-${endBlock}, skipping...`);
      return 0;
    }
    
    // Find the actual min and max block numbers in the range
    const minMaxQuery = `
      SELECT MIN(number) as min_block, MAX(number) as max_block
      FROM block
      WHERE number >= ${startBlock} AND number <= ${endBlock}
    `;
    
    const minMaxResult = await pool.query(minMaxQuery);
    const actualMinBlock = parseInt(minMaxResult.rows[0].min_block);
    const actualMaxBlock = parseInt(minMaxResult.rows[0].max_block);
    console.log(`Actual block range: ${actualMinBlock}-${actualMaxBlock}`);
    
    while (hasMore) {
      try {
        console.log(`Fetching blocks from offset ${offset}...`);
        
        // Query the database with pagination and block range filtering
        const query = `
          SELECT 
            id, 
            number, 
            hash, 
            parent_hash as "parentHash", 
            timestamp
          FROM 
            block
          WHERE
            number >= ${startBlock} AND number <= ${endBlock}
          ORDER BY 
            number ASC
          LIMIT ${pageSize} OFFSET ${offset}
        `;
        
        const result = await pool.query(query);
        
        if (result.rows.length === 0) {
          hasMore = false;
          console.log('No more blocks to fetch.');
          break;
        }
        
        // Process and write blocks to parquet
        for (const block of result.rows) {
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
          } catch (rowErr) {
            console.error(`Error processing block: ${JSON.stringify(block)}`, rowErr);
          }
        }
        
        console.log(`Processed ${result.rows.length} blocks from offset ${offset} (up to block ${result.rows[result.rows.length-1].number})`);
        offset += result.rows.length;
        
        if (result.rows.length < pageSize) {
          hasMore = false;
        }
      } catch (fetchErr) {
        console.error(`Error fetching blocks at offset ${offset}:`, fetchErr.message);
        
        // If we already processed some blocks, continue to next batch with increased offset
        // Otherwise fail completely
        if (totalRecords === 0) {
          throw fetchErr;
        }
        
        // Try to continue from next offset
        offset += pageSize;
        
        // If we've had too many errors, stop
        if (offset > blockCount + pageSize) {
          hasMore = false;
        }
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
async function fetchSubsquidBlocks() {
  console.log('Fetching Subsquid blocks...');
  
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
    const maxBlockResult = await pool.query('SELECT MAX(number) as "maxBlock" FROM block');
    
    let maxBlock = 10000000; // Default fallback
    if (maxBlockResult.rows.length > 0 && maxBlockResult.rows[0].maxBlock) {
      maxBlock = parseInt(maxBlockResult.rows[0].maxBlock);
      console.log(`Maximum block number: ${maxBlock}`);
    } else {
      console.warn('Could not determine maximum block number, using default of 10,000,000');
    }
    
    // Get total count of blocks
    const totalCountResult = await pool.query('SELECT COUNT(*) as total FROM block');
    const totalBlocks = parseInt(totalCountResult.rows[0].total);
    console.log(`Total blocks in database: ${totalBlocks.toLocaleString()}`);
    
    let totalRecords = 0;
    
    // Fetch all blocks instead of just first and last ranges
    console.log('Fetching all blocks (0 to max)...');
    totalRecords += await fetchSubsquidBlocksRange(0, maxBlock, writer);
    
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
  } finally {
    // Close the database connection pool
    await pool.end();
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
    
    // Test database connection
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('Connection to Subsquid database successful');
    } finally {
      client.release();
    }
    
    // Fetch and save blocks
    const blockCount = await fetchSubsquidBlocks();
    
    console.log('Data fetching complete!');
    console.log(`Total blocks: ${blockCount}`);
  } catch (error) {
    console.error('Error running the script:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 