const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const parquet = require('parquetjs'); // You may need to run: npm install parquetjs

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Fetch data from Subgraph with pagination and save to Parquet
 */
async function fetchSubgraphDataWithPagination() {
  console.log('Fetching complete dataset from Subgraph for case 1 (LBTC event only)...');
  
  const pageSize = 1000; // GraphQL generally handles smaller page sizes better
  let totalRows = 0;
  let hasMoreData = true;
  let lastId = '';
  
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
  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'subgraph-case1-complete.parquet'));
  
  // Fetch data in batches until we get everything
  while (hasMoreData) {
    console.log(`Fetching batch with lastId: ${lastId || 'start'}, limit: ${pageSize}...`);
    
    // GraphQL query with pagination using ID for transfers with block range 0-22281000
    const whereClause = lastId ? `where: {id_gt: "${lastId}", blockNumber_gte: 0, blockNumber_lte: 22281000}` : 
                                `where: {blockNumber_gte: 0, blockNumber_lte: 22281000}`;
    
    const query = `{
      transfers(first: ${pageSize}, ${whereClause}, orderBy: id, orderDirection: asc) {
        id
        blockNumber
        transactionHash
        from
        to
        value
      }
    }`;
    
    // The API endpoint URL for the subgraph from README
    const endpoint = "https://api.studio.thegraph.com/query/108520/case_1_lbtc_event_only/version/latest";
    
    const cmd = `curl -s -X POST "${endpoint}" -H "Content-Type: application/json" -d '{"query": "${query.replace(/\n/g, ' ').replace(/"/g, '\\"')}"}'`;
    
    const result = execSync(cmd, { 
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60000 // 1 minute timeout
    });
    
    const data = JSON.parse(result);
    
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      throw new Error('GraphQL query failed');
    }
    
    if (data.data && data.data.transfers && data.data.transfers.length > 0) {
      const transfers = data.data.transfers;
      const rowsCount = transfers.length;
      console.log(`Received ${rowsCount} rows in this batch`);
      
      // Process the batch
      for (const row of transfers) {
        // Convert blockNumber to a number if it's a string
        if (typeof row.blockNumber === 'string') {
          row.blockNumber = parseInt(row.blockNumber, 10);
        }
        
        // Write the row to Parquet
        await writer.appendRow(row);
      }
      
      totalRows += rowsCount;
      console.log(`Total rows processed so far: ${totalRows}`);
      
      // Update lastId for next batch
      lastId = transfers[transfers.length - 1].id;
      
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
  
  console.log(`Data fetch complete. Total records: ${totalRows}`);
  console.log(`Data saved to ../data/subgraph-case1-complete.parquet`);
  
  return { success: true, count: totalRows };
}

async function main() {
  console.log('Starting data collection from Subgraph...');
  
  // Delete existing file if it exists to start fresh
  const outputFile = path.join(dataDir, 'subgraph-case1-complete.parquet');
  if (fs.existsSync(outputFile)) {
    console.log(`Removing existing Parquet file: ${outputFile}`);
    fs.unlinkSync(outputFile);
  }
  
  // Fetch real data
  const result = await fetchSubgraphDataWithPagination();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} records from Subgraph.`);
  } else {
    console.error(`Failed to fetch data from Subgraph: ${result.error}`);
    process.exit(1);
  }
  
  console.log('Data processing complete!');
}

// Run the main function
main(); 