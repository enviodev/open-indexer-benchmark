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
const outputPath = path.join(dataDir, 'sentio-case5-swaps.parquet');

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

async function fetchSentioDataWithPagination() {
  try {
    console.log('Fetching complete dataset from Sentio for case 5 (Uniswap V2 traces)...');
    
    // Create a Parquet writer
    const writer = await parquet.ParquetWriter.openFile(swapSchema, outputPath);
    
    const pageSize = 5000;
    let totalRows = 0;
    let page = 0;
    let hasMoreData = true;
    
    // Block range
    const startBlock = 22200000;
    const endBlock = 22290000;
    
    // Fetch data in batches until we get everything
    while (hasMoreData) {
      const offset = page * pageSize;
      console.log(`Fetching page ${page + 1} (offset: ${offset}, limit: ${pageSize})...`);
      
      // Query with pagination
      const cmd = 'curl -L -X POST "https://app.sentio.xyz/api/v1/analytics/yufei/case_5_on_trace/sql/execute" ' +
        '-H "Content-Type: application/json" ' +
        '-H "api-key: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl" ' +
        `-d '{"sqlQuery":{"sql":"SELECT * FROM \`Swap\` WHERE blockNumber >= ${startBlock} AND blockNumber <= ${endBlock} ORDER BY transactionHash LIMIT ${pageSize} OFFSET ${offset}"}}' --silent`;
      
      try {
        const result = execSync(cmd, { 
          encoding: 'utf8',
          maxBuffer: 100 * 1024 * 1024,
          timeout: 180000 // 3 minutes timeout
        });
        
        console.log('Raw API Response:', result);
        
        const data = JSON.parse(result);
        console.log('Parsed data structure:', Object.keys(data));
        
        if (data.result) {
          console.log('Result keys:', Object.keys(data.result));
        }
        
        if (data.result && data.result.rows && data.result.rows.length > 0) {
          const rowsCount = data.result.rows.length;
          console.log(`Received ${rowsCount} rows on page ${page + 1}`);
          
          // Process the batch of data
          for (const row of data.result.rows) {
            try {
              // Convert path array to comma-separated string if needed
              let pathStr = '';
              let pathLength = 0;
              
              if (row.path && Array.isArray(row.path)) {
                pathStr = row.path.join(',');
                pathLength = row.path.length;
              } else if (typeof row.path === 'string') {
                pathStr = row.path;
                // Count commas + 1 to determine path length
                pathLength = (pathStr.match(/,/g) || []).length + 1;
              }
              
              // Map fields to standardized schema
              const standardizedRow = {
                id: row.id || '',
                blockNumber: BigInt(row.blockNumber || 0),
                transactionHash: row.transactionHash || '',
                from: (row.from__ || '').toLowerCase(),
                to: (row.to__ || '').toLowerCase(),
                amountIn: row.amountIn ? row.amountIn.toString() : '0',
                amountOutMin: row.amountOutMin ? row.amountOutMin.toString() : '0',
                deadline: row.deadline ? row.deadline.toString() : '0',
                path: pathStr,
                pathLength: pathLength
              };
              
              await writer.appendRow(standardizedRow);
            } catch (rowError) {
              console.error('Error processing row:', rowError);
            }
          }
          
          totalRows += rowsCount;
          console.log(`Total rows processed so far: ${totalRows}`);
          
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
        hasMoreData = false;
      }
    }
    
    // Close the writer
    await writer.close();
    console.log(`Complete dataset saved to Parquet file: ${outputPath}`);
    
    if (totalRows === 0) {
      console.log('Failed to fetch any data.');
      return { success: false, error: 'no_data_fetched' };
    }
    
    console.log(`Successfully retrieved and processed ${totalRows} total rows of data`);
    return { success: true, count: totalRows };
  } catch (error) {
    console.error('Error in pagination process:', error.message);
    return { success: false, error: 'pagination_error' };
  }
}

// Main function to fetch Sentio data
async function main() {
  console.log('Starting full data collection from Sentio for case 5...');
  
  const sentioResult = await fetchSentioDataWithPagination();
  console.log('Sentio fetch result:', sentioResult);
  
  if (sentioResult.success) {
    console.log(`Successfully collected ${sentioResult.count} total rows of data from Sentio.`);
  } else {
    console.error(`Failed to collect complete data: ${sentioResult.error}`);
  }
  
  console.log('Data collection complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error in main execution:', error);
  process.exit(1);
}); 