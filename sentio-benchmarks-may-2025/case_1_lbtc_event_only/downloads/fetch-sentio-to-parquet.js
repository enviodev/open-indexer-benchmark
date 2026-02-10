const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const parquet = require('parquetjs'); // You may need to run: npm install parquetjs

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function fetchSentioDataWithPagination() {
  console.log('Fetching complete dataset from Sentio for case 1 (LBTC event only)...');
  
  const pageSize = 5000;
  let totalRows = 0;
  let page = 0;
  let hasMoreData = true;
  
  // Create a Parquet schema to be initialized on first batch
  let writer = null;
  
  // Fetch data in batches until we get everything
  while (hasMoreData) {
    const offset = page * pageSize;
    console.log(`Fetching page ${page + 1} (offset: ${offset}, limit: ${pageSize})...`);
    
    // Query with pagination
    const cmd = 'curl -L -X POST "https://app.sentio.xyz/api/v1/analytics/yufei/case_1_lbtc_event_only/sql/execute" ' +
      '-H "Content-Type: application/json" ' +
      '-H "api-key: hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl" ' +
      `-d '{"sqlQuery":{"sql":"select * from Transfer order by id limit ${pageSize} offset ${offset}"}}' --silent`;
    
    const result = execSync(cmd, { 
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
      timeout: 180000 // 3 minutes timeout
    });
    
    const data = JSON.parse(result);
    
    if (data.result && data.result.rows && data.result.rows.length > 0) {
      const rows = data.result.rows;
      const rowsCount = rows.length;
      console.log(`Received ${rowsCount} rows on page ${page + 1}`);
      
      // Initialize the schema and writer if this is the first batch
      if (page === 0) {
        // Infer schema from the first row
        const firstRow = rows[0];
        const schema = {};
        
        Object.keys(firstRow).forEach(key => {
          const value = firstRow[key];
          if (typeof value === 'number') {
            schema[key] = { type: 'DOUBLE' };
          } else if (typeof value === 'boolean') {
            schema[key] = { type: 'BOOLEAN' };
          } else {
            // Default to STRING for other types
            schema[key] = { type: 'UTF8' };
          }
        });
        
        console.log('Parquet schema:', JSON.stringify(schema, null, 2));
        console.log('Sample row fields:', Object.keys(rows[0]).join(', '));
        
        // Create parquet schema and writer
        const parquetSchema = new parquet.ParquetSchema(schema);
        writer = await parquet.ParquetWriter.openFile(parquetSchema, path.join(dataDir, 'sentio-case1-complete.parquet'));
        console.log('Parquet file initialized and ready for writing');
      }
      
      // Write all rows from this batch to the Parquet file
      for (const row of rows) {
        await writer.appendRow(row);
      }
      console.log(`Wrote ${rows.length} rows to Parquet file`);
      
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
  }
  
  // Close the Parquet writer
  if (writer) {
    await writer.close();
    console.log(`Complete dataset saved to Parquet file: ../data/sentio-case1-complete.parquet`);
  }
  
  return { success: totalRows > 0, count: totalRows };
}

async function main() {
  console.log('Starting full data collection from Sentio for case 1...');
  
  // Delete existing file if it exists to start fresh
  const outputFile = path.join(dataDir, 'sentio-case1-complete.parquet');
  if (fs.existsSync(outputFile)) {
    console.log(`Removing existing Parquet file: ${outputFile}`);
    fs.unlinkSync(outputFile);
  }
  
  const sentioResult = await fetchSentioDataWithPagination();
  
  if (sentioResult.success) {
    console.log(`Successfully collected ${sentioResult.count} total rows of data from Sentio.`);
  } else {
    console.error(`Failed to collect data from Sentio.`);
    process.exit(1);
  }
  
  console.log('Data collection complete!');
}

// Run the main function
main(); 