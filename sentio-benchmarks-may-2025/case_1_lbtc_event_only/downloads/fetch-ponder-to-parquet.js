const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const parquet = require('parquetjs');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Fetch data from Ponder PostgreSQL database and save to Parquet
 */
async function fetchPonderData() {
  console.log('Fetching data from Ponder PostgreSQL database...');
  
  // PostgreSQL connection string from README
  const connectionString = 'postgresql://postgres:IaYFUoJeDdJXgiTXXXOZmaNkjjXjkBZJ@shinkansen.proxy.rlwy.net:29835/railway';
  const schema = 'fc56df99-dd01-4846-9d2e-67fbaf93c52d';
  
  // Set up PostgreSQL client
  const client = new Client({
    connectionString: connectionString,
    ssl: false,
    connectionTimeoutMillis: 30000, // 30 seconds
    query_timeout: 300000 // 5 minutes
  });
  
  // Define the schema for Parquet
  const parquetSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    blockNumber: { type: 'INT64' },
    transactionHash: { type: 'UTF8' },
    from: { type: 'UTF8' },
    to: { type: 'UTF8' },
    value: { type: 'UTF8' }
  });
  
  // Create Parquet writer
  console.log('Initializing Parquet file...');
  const writer = await parquet.ParquetWriter.openFile(parquetSchema, path.join(dataDir, 'ponder-case1-complete.parquet'));
  
  console.log('Connecting to Ponder PostgreSQL database...');
  await client.connect();
  console.log('Connected successfully!');
  
  // Query data from Ponder in batches to avoid memory issues
  const pageSize = 5000;
  let offset = 0;
  let totalRows = 0;
  let hasMoreData = true;
  
  console.log(`Fetching data in batches for block range 0-22281000...`);
  
  while (hasMoreData) {
    console.log(`Fetching batch: offset=${offset}, limit=${pageSize}`);
    
    // SQL query with the specified schema
    const query = `
      SELECT 
        id,
        block_number AS "blockNumber",
        transaction_hash AS "transactionHash",
        "from",
        "to",
        value
      FROM "${schema}".lbtc_transfer
      WHERE block_number BETWEEN 0 AND 22281000
      ORDER BY block_number, id
      LIMIT $1 OFFSET $2
    `;
    
    const result = await client.query(query, [pageSize, offset]);
    const rows = result.rows;
    
    if (rows.length === 0) {
      hasMoreData = false;
      console.log('No more data available.');
      break;
    }
    
    // Process rows and write to Parquet
    for (const row of rows) {
      // Convert blockNumber to number if it's a string
      if (typeof row.blockNumber === 'string') {
        row.blockNumber = parseInt(row.blockNumber, 10);
      }
      
      // Write row to Parquet
      await writer.appendRow(row);
    }
    
    // Update counters
    totalRows += rows.length;
    offset += pageSize;
    
    console.log(`Processed ${rows.length} records. Total so far: ${totalRows}`);
    
    // Check if we got fewer results than the page size, indicating we're done
    if (rows.length < pageSize) {
      hasMoreData = false;
    }
  }
  
  // Close the Parquet writer
  await writer.close();
  
  // Close the database connection
  await client.end();
  console.log('Database connection closed.');
  
  console.log(`Data fetch complete. Total records: ${totalRows}`);
  console.log(`Data saved to ../data/ponder-case1-complete.parquet`);
  
  return { success: true, count: totalRows };
}

async function main() {
  console.log('Starting data collection from Ponder...');
  
  // Delete existing file if it exists to start fresh
  const outputFile = path.join(dataDir, 'ponder-case1-complete.parquet');
  if (fs.existsSync(outputFile)) {
    console.log(`Removing existing Parquet file: ${outputFile}`);
    fs.unlinkSync(outputFile);
  }
  
  // Fetch real data
  const result = await fetchPonderData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} records from Ponder.`);
  } else {
    console.error(`Failed to fetch data from Ponder: ${result.error}`);
    process.exit(1);
  }
  
  console.log('Data processing complete!');
}

// Run the main function
main(); 