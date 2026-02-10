const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const parquet = require('parquetjs');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Output file path
const outputPath = path.join(dataDir, 'sentio-case4-gas.parquet');

// Sentio API details
const SENTIO_API_KEY = 'hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl';
const SENTIO_API_URL = 'https://app.sentio.xyz/api/v1/analytics/yufei/case_4_on_transaction/sql/execute';

// Define the Parquet schema for gas records
const gasSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8', compression: 'SNAPPY' },
  blockNumber: { type: 'INT64', compression: 'SNAPPY' },
  transactionHash: { type: 'UTF8', compression: 'SNAPPY' },
  sender: { type: 'UTF8', compression: 'SNAPPY' },
  recipient: { type: 'UTF8', compression: 'SNAPPY' },
  gasValue: { type: 'UTF8', compression: 'SNAPPY' }, // Using UTF8 for large numbers
  gasUsed: { type: 'UTF8', compression: 'SNAPPY' }, // Added to ensure consistency with other platforms
  gasPrice: { type: 'UTF8', compression: 'SNAPPY' },  // Added to ensure consistency with other platforms
  effectiveGasPrice: { type: 'UTF8', compression: 'SNAPPY' } // Added to track EIP-1559 gas pricing
});

// First, check the total count in the database
async function checkTotalCount() {
  console.log('Checking total records in Sentio database...');
  
  const cmd = `curl -L -X POST 'https://app.sentio.xyz/api/v1/analytics/yufei/case_4_on_transaction/sql/execute' \
  -H 'Content-Type: application/json' \
  -H 'api-key: ${SENTIO_API_KEY}' \
  --data-raw '{
    "sqlQuery": {
      "sql": "select count(blockNumber) as count from GasSpent"
    }
  }' --silent`;
  
  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    const data = JSON.parse(result);
    
    if (data && data.result && data.result.rows && data.result.rows.length > 0) {
      const totalCount = parseInt(data.result.rows[0].count);
      console.log(`Total records in Sentio database: ${totalCount.toLocaleString()}`);
      return totalCount;
    } else {
      console.error('Invalid response format when checking total count:', data);
      return 0;
    }
  } catch (error) {
    console.error('Error checking total count:', error.message);
    return 0;
  }
}

// Function to fetch Sentio data with pagination
async function fetchSentioDataWithPagination() {
  try {
    // First get total count to track progress
    const totalCount = await checkTotalCount();
    
    console.log('Fetching complete dataset from Sentio for case 4...');
    
    // Remove existing file if it exists
    if (fs.existsSync(outputPath)) {
      console.log(`Removing existing file: ${outputPath}`);
      fs.unlinkSync(outputPath);
    }
    
    // Create the Parquet writer
    const writer = await parquet.ParquetWriter.openFile(gasSchema, outputPath);
    
    const pageSize = 10000;
    let totalRows = 0;
    let page = 0;
    let hasMoreData = true;
    let processedHashes = new Set(); // Track transaction hashes to avoid duplicates
    let duplicateCount = 0;
    
    // Fetch data in batches until we get everything
    while (hasMoreData) {
      const offset = page * pageSize;
      console.log(`Fetching page ${page + 1} (offset: ${offset}, limit: ${pageSize})...`);
      
      // Query with pagination - now including gasUsed, gasPrice and effectiveGasPrice directly
      const cmd = `curl -L -X POST '${SENTIO_API_URL}' \
        -H 'Content-Type: application/json' \
        -H 'api-key: ${SENTIO_API_KEY}' \
        -d '{"sqlQuery":{"sql":"SELECT id, blockNumber, transactionHash, from__ as sender, to__ as recipient, gasValue, gasUsed, gasPrice, effectiveGasPrice FROM GasSpent ORDER BY blockNumber ASC LIMIT ${pageSize} OFFSET ${offset}"}}' --silent`;
      
      try {
        const result = execSync(cmd, { 
          encoding: 'utf8',
          maxBuffer: 100 * 1024 * 1024,
          timeout: 180000 // 3 minutes timeout
        });
        
        const data = JSON.parse(result);
        
        if (data.result && data.result.rows && data.result.rows.length > 0) {
          const rowsCount = data.result.rows.length;
          console.log(`Received ${rowsCount} rows on page ${page + 1}`);
          
          // Add results to Parquet file
          let newRowsCount = 0;
          let pageDuplicates = 0;
          
          for (const row of data.result.rows) {
            // Skip duplicates based on transaction hash
            if (processedHashes.has(row.transactionHash)) {
              pageDuplicates++;
              duplicateCount++;
              continue;
            }
            
            processedHashes.add(row.transactionHash);
            newRowsCount++;
            
            // If gasUsed and gasPrice are not available, but gasValue is, try to calculate them
            let gasPrice = row.gasPrice ? row.gasPrice.toString() : '0';
            let gasUsed = row.gasUsed ? row.gasUsed.toString() : '0';
            let gasValueFromRow = row.gasValue ? row.gasValue.toString() : '0';
            let effectiveGasPrice = row.effectiveGasPrice ? row.effectiveGasPrice.toString() : gasPrice; // Use gasPrice as fallback
            
            // Write to Parquet with complete gas data
            try {
              await writer.appendRow({
                id: row.id || '',
                blockNumber: BigInt(row.blockNumber || 0),
                transactionHash: row.transactionHash || '',
                sender: row.sender || '',
                recipient: row.recipient || '',
                gasValue: gasValueFromRow,
                gasUsed: gasUsed,
                gasPrice: gasPrice,
                effectiveGasPrice: effectiveGasPrice
              });
            } catch (appendError) {
              console.error(`Error appending row: ${appendError.message}`);
              console.error('Problematic row:', JSON.stringify(row));
            }
          }
          
          totalRows += newRowsCount;
          console.log(`New rows in this batch: ${newRowsCount} (duplicates skipped: ${pageDuplicates})`);
          console.log(`Total rows processed so far: ${totalRows} (total duplicates: ${duplicateCount})`);
          
          if (totalCount > 0) {
            const progress = (totalRows / totalCount * 100).toFixed(2);
            console.log(`Progress: ${progress}% (${totalRows}/${totalCount})`);
          }
          
          // Continue pagination only if we received a full page
          hasMoreData = rowsCount >= pageSize;
          page++;
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log('No more data available or empty response received.');
          hasMoreData = false;
        }
      } catch (error) {
        console.error(`Error fetching page ${page + 1}:`, error.message);
        
        // Retry logic for transient errors
        console.log('Waiting 10 seconds before retrying...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Don't increment page number so we retry the same batch
        continue;
      }
    }
    
    // Clean up memory
    const uniqueTransactions = processedHashes.size;
    processedHashes.clear();
    
    if (totalRows === 0) {
      console.log('Failed to fetch any data.');
      return { success: false, error: 'no_data_fetched' };
    }
    
    // Finish up and close the Parquet writer
    try {
      await writer.close();
      console.log(`\nData collection summary:`);
      console.log(`- Unique rows saved: ${totalRows}`);
      console.log(`- Duplicate rows skipped: ${duplicateCount}`);
      console.log(`- Unique transaction hashes: ${uniqueTransactions}`);
      
      // Get and log file size
      const fileStats = fs.statSync(outputPath);
      console.log(`- Output file size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);
      
      if (totalCount > 0) {
        const completeness = (totalRows / totalCount * 100).toFixed(2);
        console.log(`- Collection completeness: ${completeness}%`);
      }
    } catch (closeError) {
      console.error('Error closing Parquet writer:', closeError.message);
    }
    
    return { success: true, count: totalRows, expected: totalCount };
  } catch (error) {
    console.error('Error in fetchSentioDataWithPagination:', error.message);
    return { success: false, error: error.message };
  }
}

// Main function to fetch Sentio data
async function main() {
  console.log('Starting full data collection from Sentio for case 4...');
  
  const sentioResult = await fetchSentioDataWithPagination();
  
  if (sentioResult.success) {
    console.log(`\nSuccessfully collected ${sentioResult.count.toLocaleString()} total rows of data from Sentio.`);
    if (sentioResult.expected > 0 && sentioResult.count < sentioResult.expected) {
      console.warn(`Warning: Only collected ${sentioResult.count.toLocaleString()} out of ${sentioResult.expected.toLocaleString()} expected records.`);
    }
  } else {
    console.error(`Failed to collect data: ${sentioResult.error}`);
  }
  
  console.log('Data collection complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error in main execution:', error);
  process.exit(1);
}); 