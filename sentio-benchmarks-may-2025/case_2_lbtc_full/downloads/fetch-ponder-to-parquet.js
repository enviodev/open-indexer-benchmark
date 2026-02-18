const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const parquet = require('parquetjs');

// Output directory setup
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ponder database details
const DB_CONFIG = {
  host: 'localhost',
  port: 6432,
  database: 'ponder_dev',
  user: 'postgres',
  password: 'postgres',
  // Increase connection timeout to 30 seconds
  connectionTimeoutMillis: 30000,
  // Increase query timeout to 3 minutes
  statement_timeout: 180000
};

// Schema definitions
const transferSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  transactionHash: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  value: { type: 'UTF8' } // Using UTF8 for large numbers
});

const accountSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  balance: { type: 'UTF8' }, // Using UTF8 for large numbers
  timestamp: { type: 'UTF8' },  // Adding timestamp from the snapshot
  point: { type: 'UTF8' }  // Adding point from the snapshot
});

// Fetch and save transfer data
async function fetchPonderTransfers() {
  const outputPath = path.join(dataDir, 'ponder-case2-transfers.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  const client = new Client(DB_CONFIG);
  await client.connect();
  
  // Set statement timeout
  await client.query(`SET statement_timeout TO ${DB_CONFIG.statement_timeout}`);
  
  const writer = await parquet.ParquetWriter.openFile(transferSchema, outputPath);
  let offset = 0;
  const batchSize = 10000;
  let totalRows = 0;
  
  console.log('Fetching transfer data from local Ponder PostgreSQL...');
  
  while (true) {
    console.log(`Fetching transfers with offset ${offset}...`);
    
    const result = await client.query(
      `SELECT id, block_number, transaction_hash, "from", "to", value 
       FROM lbtc_transfer 
       ORDER BY block_number DESC 
       LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );
    
    console.log(`Received ${result.rows.length} transfers`);
    
    if (result.rows.length === 0) {
      break;
    }
    
    for (const row of result.rows) {
      const record = {
        id: row.id || '',
        blockNumber: Number(row.block_number || 0),
        transactionHash: row.transaction_hash || '',
        from: row.from || '',
        to: row.to || '',
        value: row.value ? String(row.value) : '0'
      };
      
      await writer.appendRow(record);
    }
    
    totalRows += result.rows.length;
    offset += batchSize;
    
    if (result.rows.length < batchSize) {
      break;
    }
  }
  
  await writer.close();
  console.log(`Saved ${totalRows} transfer records to ${outputPath}`);
  
  // Now fetch account data with balances from the snapshot table
  await fetchPonderAccounts(client);
  
  // Close the database connection
  await client.end();
  console.log('Ponder data fetching complete!');
}

// Fetch and save account data with balances from snapshots
async function fetchPonderAccounts(client) {
  const accountOutputPath = path.join(dataDir, 'ponder-case2-accounts.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(accountOutputPath)) {
    fs.unlinkSync(accountOutputPath);
    console.log(`Removed existing file: ${accountOutputPath}`);
  }
  
  const accountWriter = await parquet.ParquetWriter.openFile(accountSchema, accountOutputPath);
  
  console.log('Fetching account data with latest point values from snapshots...');
  
  // Query to get the latest snapshot for each account using a CTE
  const query = `
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (account_id) 
        account_id, 
        point, 
        timestamp
      FROM snapshot 
      ORDER BY account_id, timestamp DESC
    )
    SELECT 
      a.id, 
      a.balance, 
      s.timestamp, 
      s.point
    FROM accounts a
    LEFT JOIN latest_snapshots s ON a.id = s.account_id
    ORDER BY a.id
  `;
  
  const result = await client.query(query);
  console.log(`Received ${result.rows.length} accounts with their latest point values`);
  
  if (result.rows.length === 0) {
    // Write a dummy record to avoid empty parquet file
    await accountWriter.appendRow({ id: 'dummy', balance: '0', timestamp: '0', point: '0' });
    console.log('No accounts found, wrote dummy record');
  } else {
    for (const row of result.rows) {
      const record = {
        id: row.id || '',
        balance: row.balance ? String(row.balance) : '0',
        timestamp: row.timestamp ? String(row.timestamp) : '0',
        point: row.point ? String(row.point) : '0'
      };
      
      await accountWriter.appendRow(record);
    }
  }
  
  await accountWriter.close();
  console.log(`Saved ${result.rows.length} account records to ${accountOutputPath}`);
}

// Run the script with error handling
async function runWithErrorHandling() {
  try {
    await fetchPonderTransfers();
  } catch (error) {
    console.error('Error occurred during data fetching:');
    console.error(error);
    process.exit(1);
  }
}

runWithErrorHandling();