const fs = require('fs');
const path = require('path');
const axios = require('axios');
const parquet = require('parquetjs');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Output file path
const outputPath = path.join(dataDir, 'envio-case5-swaps.parquet');

// Envio API endpoint for Case 5
const ENVIO_ENDPOINT = 'https://indexer.dev.hyperindex.xyz/0aa1b1/v1/graphql';

// Define the GraphQL query for swap records
const swapQuery = `
query SwapEvents($limit: Int!, $offset: Int!) {
  SwapEvent(limit: $limit, offset: $offset, order_by: {blockNumber: asc}) {
    id
    blockNumber
    txHash
    from
    to
    amountIn
    amountOutMin
    deadline
    path
    pathLength
  }
}
`;

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

// Function to fetch and save Envio swap data
async function fetchEnvioData() {
  try {
    console.log('Fetching Uniswap V2 swap data from Envio...');
    
    // Create a Parquet writer
    const writer = await parquet.ParquetWriter.openFile(swapSchema, outputPath);
    
    const pageSize = 1000;
    let offset = 0;
    let totalRows = 0;
    let hasMoreData = true;
    
    while (hasMoreData) {
      console.log(`Fetching page with offset ${offset}, limit ${pageSize}...`);
      
      try {
        const response = await axios.post(
          ENVIO_ENDPOINT,
          {
            query: swapQuery,
            variables: { limit: pageSize, offset: offset }
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // 1 minute timeout
          }
        );
        
        if (response.data && response.data.data && response.data.data.SwapEvent) {
          const swapRecords = response.data.data.SwapEvent;
          console.log(`Received ${swapRecords.length} swap records`);
          
          if (swapRecords.length === 0) {
            hasMoreData = false;
            break;
          }
          
          // Add records to parquet file
          for (const record of swapRecords) {
            // Ensure path is a string and calculate pathLength if needed
            let pathStr = record.path || '';
            let pathLength = record.pathLength || 0;
            
            // If there's no pathLength but path is a string, calculate it from the path
            if (!pathLength && pathStr) {
              pathLength = (pathStr.match(/,/g) || []).length + 1;
            }
            
            await writer.appendRow({
              id: record.id,
              blockNumber: BigInt(record.blockNumber || 0),
              transactionHash: record.txHash || '',
              from: (record.from || '').toLowerCase(),
              to: (record.to || '').toLowerCase(),
              amountIn: record.amountIn ? record.amountIn.toString() : '0',
              amountOutMin: record.amountOutMin ? record.amountOutMin.toString() : '0',
              deadline: record.deadline ? record.deadline.toString() : '0',
              path: pathStr,
              pathLength: pathLength
            });
          }
          
          totalRows += swapRecords.length;
          console.log(`Total records processed so far: ${totalRows}`);
          
          // Continue pagination only if we received a full page
          hasMoreData = swapRecords.length === pageSize;
          offset += swapRecords.length;
          
          // Add a small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error('Invalid response format:', response.data);
          hasMoreData = false;
        }
      } catch (error) {
        console.error('Error fetching Envio data:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
        }
        
        // Wait a bit longer before retrying
        console.log('Waiting 5 seconds before retrying...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // If we've had multiple failures, break out of the loop
        if (totalRows === 0) {
          console.error('Failed to fetch any data after multiple attempts. Exiting.');
          hasMoreData = false;
        }
      }
    }
    
    await writer.close();
    
    console.log(`\nData collection complete.`);
    console.log(`Saved ${totalRows} swap records to ${outputPath}`);
    
    return { success: true, count: totalRows };
  } catch (error) {
    console.error('Error in fetchEnvioData:', error);
    return { success: false, error: error.message };
  }
}

// Test the API connection
async function testConnection() {
  try {
    console.log(`Testing connection to Envio GraphQL API at ${ENVIO_ENDPOINT}...`);
    
    const response = await axios.post(
      ENVIO_ENDPOINT,
      {
        query: `query { __schema { queryType { name } } }`
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    if (response.data && response.data.data) {
      console.log('Connection successful!');
      return true;
    } else {
      console.error('Connection test failed. Unexpected response:', response.data);
      return false;
    }
  } catch (error) {
    console.error('Connection test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('Starting data collection from Envio for Uniswap V2 swap events...');
  
  // Test connection first
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('Failed to connect to Envio API. Exiting.');
    process.exit(1);
  }
  
  const result = await fetchEnvioData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} swap records from Envio`);
  } else {
    console.error(`Failed to collect Envio data: ${result.error}`);
  }
  
  console.log('Data collection complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error in main execution:', error);
  process.exit(1);
}); 