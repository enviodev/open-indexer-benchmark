const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const parquet = require('parquetjs'); // You may need to run: npm install parquetjs

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Fetch data from Subsquid PostgreSQL database and save to Parquet
 */
async function fetchSubsquidData() {
  console.log('Fetching data from Subsquid PostgreSQL database...');
  
  // PostgreSQL connection details from README
  const host = 'pg.squid.subsquid.io';
  const database = '16177_ku9u1f';
  const user = '16177_ku9u1f';
  const password = 'kbr06QnqfXX66cb7Bm9Qdovvx6TvU8C~';
  
  // Set up PostgreSQL client
  const client = new Client({
    host,
    database,
    user,
    password,
    ssl: false,
    connectionTimeoutMillis: 30000, // 30 seconds
    query_timeout: 300000 // 5 minutes
  });
  
  // Define the schema for Parquet - using the exact column names we found
  const schema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    block_number: { type: 'INT64' },
    transaction_hash: { type: 'UTF8' }, // Note: This is bytea in DB, we'll convert to hex
    from: { type: 'UTF8' },
    to: { type: 'UTF8' },
    value: { type: 'UTF8' }
  });
  
  // Create Parquet writer
  console.log('Initializing Parquet file...');
  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'subsquid-case1-complete.parquet'));
  
  console.log('Connecting to Subsquid PostgreSQL database...');
  await client.connect();
  console.log('Connected successfully!');
  
  // Query data from Subsquid in batches to avoid memory issues
  const pageSize = 5000;
  let offset = 0;
  let totalRows = 0;
  let hasMoreData = true;
  
  console.log(`Fetching data in batches for block range 0-22281000...`);
  
  while (hasMoreData) {
    console.log(`Fetching batch: offset=${offset}, limit=${pageSize}`);
    
    // SQL query to fetch transfer records with the correct column names
    // Converting bytea transaction_hash to hex string
    const query = `
      SELECT 
        id,
        block_number,
        encode(transaction_hash, 'hex') as transaction_hash,
        "from",
        "to",
        value::text
      FROM transfer
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
      // Convert block_number to number if it's a string
      if (typeof row.block_number === 'string') {
        row.block_number = parseInt(row.block_number, 10);
      }
      
      // Add 0x prefix to transaction hash
      if (!row.transaction_hash.startsWith('0x')) {
        row.transaction_hash = '0x' + row.transaction_hash;
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
  console.log(`Data saved to ../data/subsquid-case1-complete.parquet`);
  
  return { success: true, count: totalRows };
}

async function main() {
  console.log('Starting data collection from Subsquid...');
  
  // Delete existing file if it exists to start fresh
  const outputFile = path.join(dataDir, 'subsquid-case1-complete.parquet');
  if (fs.existsSync(outputFile)) {
    console.log(`Removing existing Parquet file: ${outputFile}`);
    fs.unlinkSync(outputFile);
  }
  
  // Fetch real data
  const result = await fetchSubsquidData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} records from Subsquid.`);
  } else {
    console.error(`Failed to fetch data from Subsquid: ${result.error}`);
    process.exit(1);
  }
  
  console.log('Data processing complete!');
}

// Run the main function
main(); 