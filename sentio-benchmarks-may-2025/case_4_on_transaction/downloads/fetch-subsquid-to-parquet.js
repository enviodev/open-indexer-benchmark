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
const outputPath = path.join(dataDir, 'subsquid-case4-gas.parquet');

// Subsquid API details
const SUBSQUID_ENDPOINT = 'https://pine-quench.squids.live/case-4-on-transaction@v1/api/graphql';

// Define the GraphQL query for gas records, updated to match actual schema
// Based on the schema introspection to use the correct field names
const gasQuery = `
query GasRecords($limit: Int!, $offset: Int!) {
  gasSpents(limit: $limit, offset: $offset, orderBy: blockNumber_ASC, where: {blockNumber_gte: 22280000, blockNumber_lte: 22290000}) {
    id
    blockNumber
    transactionHash
    from
    to
    gasValue
    gasUsed
    gasPrice
    effectiveGasPrice
  }
}
`;

// Testing query to verify API connectivity - just fetch one record to check connectivity
const testQuery = `
query TestConnection {
  gasSpents(limit: 1) {
    id
    blockNumber
    from
    to
  }
}
`;

// Define the Parquet schema for gas records
const gasSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8', compression: 'SNAPPY' },
  blockNumber: { type: 'INT64', compression: 'SNAPPY' },
  transactionHash: { type: 'UTF8', compression: 'SNAPPY' },
  sender: { type: 'UTF8', compression: 'SNAPPY' },
  recipient: { type: 'UTF8', compression: 'SNAPPY' },
  gasValue: { type: 'UTF8', compression: 'SNAPPY' }, // Using UTF8 for large numbers
  gasUsed: { type: 'UTF8', compression: 'SNAPPY' }, // Explicitly storing for consistency
  gasPrice: { type: 'UTF8', compression: 'SNAPPY' },  // Explicitly storing for consistency
  effectiveGasPrice: { type: 'UTF8', compression: 'SNAPPY' } // Added to track EIP-1559 gas pricing
});

// Function to test Subsquid API connection
async function testSubsquidConnection() {
  try {
    console.log(`Testing connection to Subsquid API at ${SUBSQUID_ENDPOINT}...`);
    
    const response = await axios.post(
      SUBSQUID_ENDPOINT,
      {
        query: testQuery
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    
    if (response.data && !response.data.errors) {
      console.log('Connection successful!');
      if (response.data.data && response.data.data.gasSpents && response.data.data.gasSpents.length > 0) {
        console.log('Successfully retrieved a test record from Subsquid.');
        // Log available fields to better understand the schema
        console.log('Available fields in test record:', Object.keys(response.data.data.gasSpents[0]).join(', '));
      }
      return true;
    } else if (response.data && response.data.errors) {
      console.error('Connection test failed with GraphQL errors:', response.data.errors);
      return false;
    } else {
      console.error('Connection test failed. Unexpected response:', response.data);
      return false;
    }
  } catch (error) {
    console.error('Connection test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return false;
  }
}

// Function to fetch and save Subsquid data
async function fetchSubsquidData() {
  try {
    console.log('Fetching gas usage data from Subsquid...');
    
    // First test the connection
    const connectionTest = await testSubsquidConnection();
    if (!connectionTest) {
      console.error('Failed to connect to Subsquid API. Aborting.');
      return { success: false, error: 'connection_failed' };
    }
    
    // First remove any existing file to start fresh
    if (fs.existsSync(outputPath)) {
      console.log(`Removing existing file: ${outputPath}`);
      fs.unlinkSync(outputPath);
    }
    
    // Create a Parquet writer
    const writer = await parquet.ParquetWriter.openFile(gasSchema, outputPath);
    
    const pageSize = 1000;
    let offset = 0;
    let totalRows = 0;
    let hasMoreData = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const startTime = Date.now();
    
    while (hasMoreData) {
      console.log(`Fetching page with offset ${offset}, limit ${pageSize}...`);
      
      try {
        const response = await axios.post(
          SUBSQUID_ENDPOINT,
          {
            query: gasQuery,
            variables: { limit: pageSize, offset: offset }
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // 1 minute timeout
          }
        );
        
        if (response.data && response.data.data && response.data.data.gasSpents) {
          const gasRecords = response.data.data.gasSpents;
          console.log(`Received ${gasRecords.length} gas records`);
          
          if (gasRecords.length === 0) {
            hasMoreData = false;
            break;
          }
          
          // Add records to parquet file
          for (const record of gasRecords) {
            // Extract gas metrics explicitly, with fallbacks
            const gasUsed = record.gasUsed ? record.gasUsed.toString() : '0';
            const gasPrice = record.gasPrice ? record.gasPrice.toString() : '0';
            const gasValueFromRecord = record.gasValue ? record.gasValue.toString() : '0';
            const effectiveGasPrice = record.effectiveGasPrice ? record.effectiveGasPrice.toString() : gasPrice; // Use gasPrice as fallback
            
            // Debug the first few records
            if (totalRows < 5) {
              console.log(`Record ${record.id} details:`);
              console.log(`- Block: ${record.blockNumber}`);
              console.log(`- From: ${record.from}`);
              console.log(`- To: ${record.to}`);
              console.log(`- Gas Value: ${gasValueFromRecord}`);
              console.log(`- Gas Used: ${gasUsed}`);
              console.log(`- Gas Price: ${gasPrice}`);
              console.log(`- Effective Gas Price: ${effectiveGasPrice}`);
            }
            
            try {
              await writer.appendRow({
                id: record.id,
                blockNumber: BigInt(record.blockNumber || 0),
                transactionHash: record.transactionHash || record.id,
                sender: record.from || '',
                recipient: record.to || '',
                gasValue: gasValueFromRecord,
                gasUsed: gasUsed,
                gasPrice: gasPrice,
                effectiveGasPrice: effectiveGasPrice
              });
            } catch (appendError) {
              console.error(`Error appending record ${record.id}: ${appendError.message}`);
              continue; // Skip this record but continue processing
            }
          }
          
          totalRows += gasRecords.length;
          
          // Log progress with rate information
          const elapsedSecs = (Date.now() - startTime) / 1000;
          const recordsPerSec = totalRows / elapsedSecs;
          console.log(`Total records processed so far: ${totalRows} (${recordsPerSec.toFixed(2)} records/sec)`);
          
          // Continue pagination only if we received a full page
          hasMoreData = gasRecords.length === pageSize;
          offset += gasRecords.length;
          
          // Reset retry counter on successful request
          retryCount = 0;
          
          // Add a small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error('Invalid response format:', response.data);
          
          // Implement retry with backoff
          retryCount++;
          if (retryCount <= MAX_RETRIES) {
            const backoffTime = retryCount * 5000; // 5s, 10s, 15s backoff
            console.log(`Retrying in ${backoffTime/1000} seconds... (Attempt ${retryCount} of ${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            continue;
          }
          
          hasMoreData = false;
        }
      } catch (error) {
        console.error('Error fetching Subsquid data:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', error.response.data);
        }
        
        // Implement retry with backoff
        retryCount++;
        if (retryCount <= MAX_RETRIES) {
          const backoffTime = retryCount * 5000; // 5s, 10s, 15s backoff
          console.log(`Retrying in ${backoffTime/1000} seconds... (Attempt ${retryCount} of ${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
          continue;
        }
        
        hasMoreData = false;
      }
    }
    
    await writer.close();
    
    // Log results
    if (totalRows > 0) {
      const elapsedSecs = (Date.now() - startTime) / 1000;
      console.log(`\nData collection complete:`);
      console.log(`- Saved ${totalRows} gas records to ${outputPath}`);
      console.log(`- Processing rate: ${(totalRows / elapsedSecs).toFixed(2)} records/sec`);
      console.log(`- Total execution time: ${elapsedSecs.toFixed(2)} seconds`);
      
      // Log file size
      const fileStats = fs.statSync(outputPath);
      console.log(`- Output file size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);
      
      return { success: true, count: totalRows };
    } else {
      console.error('Failed to fetch any data from Subsquid.');
      return { success: false, error: 'no_data_fetched' };
    }
  } catch (error) {
    console.error('Error in fetchSubsquidData:', error);
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  console.log('Starting data collection from Subsquid for case 4...');
  
  const result = await fetchSubsquidData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} gas records from Subsquid`);
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