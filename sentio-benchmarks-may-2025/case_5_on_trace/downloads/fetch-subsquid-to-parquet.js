const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');
const { Pool } = require('pg');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Output file path
const outputPath = path.join(dataDir, 'subsquid-case5-swaps.parquet');

// Postgres connection configuration
const pgConfig = {
  host: 'pg.squid.subsquid.io',
  database: '16293_s2lfwf',
  user: '16293_s2lfwf',
  password: 'i7KrA6p~WoJLCI1lsi8rPtYgfHxZV_V4',
  port: 5432,
};

// Define the standardized Parquet schema for swap records
const swapSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  transactionHash: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  amountIn: { type: 'UTF8' },  // Store as strings to maintain precision
  amountOutMin: { type: 'UTF8' },
  deadline: { type: 'UTF8' },
  path: { type: 'UTF8' },
  pathLength: { type: 'INT32' }
});

// Function to fetch and save Subsquid data from PostgreSQL
async function fetchSubsquidData() {
  const pool = new Pool(pgConfig);
  let client = null;

  try {
    console.log('Connecting to Subsquid PostgreSQL database...');
    client = await pool.connect();
    console.log('Connected successfully. Fetching swap data...');
    
    // Create a Parquet writer
    const writer = await parquet.ParquetWriter.openFile(swapSchema, outputPath);
    
    const pageSize = 1000;
    let offset = 0;
    let totalRows = 0;
    let hasMoreData = true;
    
    // First, get the column names to ensure we're using the right field names
    const columnQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'swap'
      ORDER BY ordinal_position;
    `;
    
    const columnResult = await client.query(columnQuery);
    console.log('Swap table columns:');
    columnResult.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type}`);
    });
    
    // Query to fetch swap data with pagination
    const query = `
      SELECT id, block_number, transaction_hash, "from", "to", 
             amount_in, amount_out_min, deadline, path, path_length
      FROM swap
      ORDER BY block_number ASC
      LIMIT $1 OFFSET $2
    `;
    
    while (hasMoreData) {
      console.log(`Fetching page with offset ${offset}, limit ${pageSize}...`);
      
      try {
        const result = await client.query(query, [pageSize, offset]);
        const swapRecords = result.rows;
        
        console.log(`Received ${swapRecords.length} swap records`);
        
        if (swapRecords.length === 0) {
          hasMoreData = false;
          break;
        }
        
        // Add records to parquet file, converting from snake_case to camelCase for the output
        for (const record of swapRecords) {
          await writer.appendRow({
            id: record.id,
            blockNumber: BigInt(record.block_number || 0),
            transactionHash: record.transaction_hash || '',
            from: (record.from || '').toLowerCase(),
            to: (record.to || '').toLowerCase(),
            amountIn: record.amount_in ? record.amount_in.toString() : '0',
            amountOutMin: record.amount_out_min ? record.amount_out_min.toString() : '0',
            deadline: record.deadline ? record.deadline.toString() : '0',
            path: record.path || '',
            pathLength: parseInt(record.path_length) || 0
          });
        }
        
        totalRows += swapRecords.length;
        console.log(`Total records processed so far: ${totalRows}`);
        
        // Continue pagination only if we received a full page
        hasMoreData = swapRecords.length === pageSize;
        offset += swapRecords.length;
      } catch (error) {
        console.error('Error fetching data from PostgreSQL:', error.message);
        hasMoreData = false;
      }
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} swap records to ${outputPath}`);
    return { success: true, count: totalRows };
  } catch (error) {
    console.error('Error in fetchSubsquidData:', error);
    return { success: false, error: error.message };
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Main function
async function main() {
  console.log('Starting data collection from Subsquid PostgreSQL for case 5...');
  
  const result = await fetchSubsquidData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} swap records from Subsquid`);
  } else {
    console.error(`Failed to collect Subsquid data: ${result.error}`);
  }
  
  console.log('Data collection complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error in main execution:', error);
  process.exit(1);
}); 