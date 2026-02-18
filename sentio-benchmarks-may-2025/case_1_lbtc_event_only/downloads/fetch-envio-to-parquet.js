const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const parquet = require('parquetjs');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Fetch data from Envio GraphQL API and save to Parquet
 */
async function fetchEnvioData() {
  console.log('Fetching data from Envio GraphQL API...');
  
  // Define the schema for Parquet
  const schema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    blockNumber: { type: 'INT64' },
    transactionHash: { type: 'UTF8' },
    from: { type: 'UTF8' },
    to: { type: 'UTF8' },
    value: { type: 'UTF8' }
  });
  
  // Create Parquet writer
  console.log('Initializing Parquet file...');
  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'envio-case1-complete.parquet'));
  
  // Fetch data in batches
  const pageSize = 1000; // GraphQL generally handles smaller page sizes better
  let totalRecords = 0;
  let hasMoreData = true;
  let currentOffset = 0;
  
  console.log('Fetching data in batches for block range 0-22200000...');
  
  while (hasMoreData) {
    console.log(`Fetching batch with offset: ${currentOffset}, limit: ${pageSize}...`);
    
    // GraphQL query with pagination and block range
    const query = `{
      TransparentUpgradeableProxy_Transfer(limit: ${pageSize}, offset: ${currentOffset}, order_by: {id: asc}, where: {blockNumber: {_gte: 0, _lte: 22200000}}) {
        id
        blockNumber
        transactionHash
        from
        to
        value
      }
    }`;
    
    const cmd = `curl -s -X POST "https://indexer.dev.hyperindex.xyz/6c63ec1/v1/graphql" -H "Content-Type: application/json" -d '{"query": "${query.replace(/\n/g, ' ').replace(/"/g, '\\"')}"}'`;
    
    const result = execSync(cmd, { 
      encoding: 'utf8', 
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000 // 1 minute timeout
    });
    
    const data = JSON.parse(result);
    
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      break;
    }
    
    if (data.data && data.data.TransparentUpgradeableProxy_Transfer && data.data.TransparentUpgradeableProxy_Transfer.length > 0) {
      const transfers = data.data.TransparentUpgradeableProxy_Transfer;
      const rowsCount = transfers.length;
      console.log(`Received ${rowsCount} rows in this batch`);
      
      // Process the batch
      for (const row of transfers) {
        // Convert blockNumber to number if it's a string
        if (typeof row.blockNumber === 'string') {
          row.blockNumber = parseInt(row.blockNumber, 10);
        }
        
        // Write the row to Parquet
        await writer.appendRow(row);
      }
      
      totalRecords += rowsCount;
      console.log(`Total rows processed so far: ${totalRecords}`);
      
      // Increment the offset for the next batch
      currentOffset += pageSize;
      
      // Continue pagination only if we received a full page
      hasMoreData = rowsCount >= pageSize;
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log('No more data available or empty response received.');
      hasMoreData = false;
    }
  }
  
  // Close the Parquet writer
  await writer.close();
  
  console.log(`Data fetch complete. Total records: ${totalRecords}`);
  console.log(`Data saved to ../data/envio-case1-complete.parquet`);
  
  return { success: true, count: totalRecords };
}

async function main() {
  console.log('Starting data collection from Envio...');
  
  // Delete existing file if it exists to start fresh
  const outputFile = path.join(dataDir, 'envio-case1-complete.parquet');
  if (fs.existsSync(outputFile)) {
    console.log(`Removing existing Parquet file: ${outputFile}`);
    fs.unlinkSync(outputFile);
  }
  
  // Fetch real data
  const result = await fetchEnvioData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} records from Envio.`);
  } else {
    console.error(`Failed to fetch data from Envio: ${result.error}`);
    process.exit(1);
  }
  
  console.log('Data processing complete!');
}

// Run the main function
main(); 