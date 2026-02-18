const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const parquet = require('parquetjs');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Output file path - store directly in data directory
const outputPath = path.join(dataDir, 'ponder-case4-gas.parquet');

// Ponder database details for Docker PostgreSQL container ponder_postgres_case4
const connectionString = 'postgres://postgres:postgres_password@localhost:5433/postgres';

// Define the Parquet schema for gas records
const gasSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  transactionHash: { type: 'UTF8' },
  sender: { type: 'UTF8' },
  recipient: { type: 'UTF8' },
  gasValue: { type: 'UTF8' }, // Using UTF8 for large numbers
  gasUsed: { type: 'UTF8' }, // Using UTF8 for large numbers
  gasPrice: { type: 'UTF8' }, // Using UTF8 for large numbers
  effectiveGasPrice: { type: 'UTF8' } // Added to track EIP-1559 gas pricing
});

// Function to fetch and save Ponder data
async function fetchPonderData() {
  // Create a PostgreSQL client
  const client = new Client({
    connectionString: connectionString
  });

  try {
    console.log('Connecting to Ponder PostgreSQL database...');
    await client.connect();
    console.log('Connected to database. Checking schemas...');
    
    // List available schemas
    const schemasResult = await client.query('SELECT schema_name FROM information_schema.schemata');
    console.log('Available schemas:', schemasResult.rows.map(r => r.schema_name).join(', '));
    
    // Set schema to use - Ponder typically uses public schema
    let schemaToUse = 'public';
    console.log(`Using schema: ${schemaToUse}`);
    
    // List available tables in the schema
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1
    `, [schemaToUse]);
    
    console.log(`Tables in ${schemaToUse} schema:`, tablesResult.rows.map(r => r.table_name).join(', '));
    
    // Use the correct table name "gasSpent" (case-sensitive)
    let tableName = 'gasSpent';
    
    // Check if gasSpent table exists
    const gasSpentExists = tablesResult.rows.some(row => 
      row.table_name === 'gasSpent'
    );
    
    if (!gasSpentExists) {
      // If not found, try to find any gas-related table
      const gasRelatedTables = tablesResult.rows.filter(row => 
        row.table_name.toLowerCase().includes('gas') || 
        row.table_name.toLowerCase().includes('transaction')
      );
      
      if (gasRelatedTables.length > 0) {
        tableName = gasRelatedTables[0].table_name;
      } else if (tablesResult.rows.length > 0) {
        // Fall back to any available table
        tableName = tablesResult.rows[0].table_name;
      } else {
        throw new Error('No suitable tables found in the database');
      }
    }
    
    console.log(`Using table: ${tableName}`);
    
    // Check table schema to map column names correctly
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2
    `, [schemaToUse, tableName]);
    
    console.log(`Columns in ${schemaToUse}.${tableName}:`, 
      columnsResult.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
    
    // Get column names for analysis
    const columnNames = columnsResult.rows.map(r => r.column_name);
    
    // Check if all required gas-related columns exist
    console.log('Looking for gas-related columns:', columnNames.filter(col => 
      col.toLowerCase().includes('gas')).join(', '));
    
    // Create Parquet writer
    console.log('Creating Parquet writer...');
    const writer = await parquet.ParquetWriter.openFile(gasSchema, outputPath);
    
    // Block range from the README (use case 4 range)
    const startBlock = 22280000;
    const endBlock = 22290000;
    
    // Count total records
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM "${schemaToUse}"."${tableName}" 
      WHERE "blockNumber" >= $1 AND "blockNumber" <= $2
    `;
    
    try {
      const countResult = await client.query(countQuery, [startBlock, endBlock]);
      const totalCount = parseInt(countResult.rows[0].count);
      console.log(`Total records to fetch: ${totalCount}`);
    } catch (countError) {
      console.warn('Error counting records:', countError.message);
      
      // Try alternative column names
      try {
        const altCountQuery = `
          SELECT COUNT(*) as count 
          FROM "${schemaToUse}"."${tableName}" 
          WHERE "block_number" >= $1 AND "block_number" <= $2
        `;
        const altCountResult = await client.query(altCountQuery, [startBlock, endBlock]);
        const totalCount = parseInt(altCountResult.rows[0].count);
        console.log(`Total records to fetch: ${totalCount}`);
      } catch (altCountError) {
        console.warn('Error counting records with alternative column names:', altCountError.message);
        console.log('Continuing without count...');
      }
    }
    
    // Fetch in batches to avoid memory issues
    const batchSize = 1000;
    let offset = 0;
    let totalRows = 0;
    let hasMoreData = true;
    
    console.log('Fetching gas usage data in batches...');
    
    // Determine if we should use camelCase or snake_case based on column names
    const usesCamelCase = columnNames.includes('blockNumber') || columnNames.includes('transactionHash');
    
    // Verify gas-related columns
    const hasGasValue = columnNames.includes('gasValue') || columnNames.includes('gas_value');
    const hasGasUsed = columnNames.includes('gasUsed') || columnNames.includes('gas_used');
    const hasGasPrice = columnNames.includes('gasPrice') || columnNames.includes('gas_price');
    const hasEffectiveGasPrice = columnNames.includes('effectiveGasPrice') || columnNames.includes('effective_gas_price');
    
    console.log(`Gas columns verification: gasValue=${hasGasValue}, gasUsed=${hasGasUsed}, gasPrice=${hasGasPrice}, effectiveGasPrice=${hasEffectiveGasPrice}`);
    
    while (hasMoreData) {
      console.log(`Fetching batch with offset ${offset}, limit ${batchSize}...`);
      
      try {
        // Query with pagination - adapt to the detected column naming style
        const query = usesCamelCase ? `
          SELECT * FROM "${schemaToUse}"."${tableName}"
          WHERE "blockNumber" >= $1 AND "blockNumber" <= $2
          ORDER BY "blockNumber"
          LIMIT $3 OFFSET $4
        ` : `
          SELECT * FROM "${schemaToUse}"."${tableName}"
          WHERE "block_number" >= $1 AND "block_number" <= $2
          ORDER BY "block_number"
          LIMIT $3 OFFSET $4
        `;
        
        const result = await client.query(query, [startBlock, endBlock, batchSize, offset]);
        const records = result.rows;
        
        console.log(`Received ${records.length} records`);
        
        if (records.length === 0) {
          hasMoreData = false;
          break;
        }
        
        // Show sample of first record
        if (offset === 0 && records.length > 0) {
          console.log('Sample record:', JSON.stringify(records[0]));
          console.log('Sample record keys:', Object.keys(records[0]));
        }
        
        // Add records to parquet file
        for (const record of records) {
          // Map database fields to Parquet schema, handling both camelCase and snake_case
          const gasUsed = (record.gasUsed || record.gas_used) ? 
            (record.gasUsed || record.gas_used).toString() : '0';
            
          const gasPrice = (record.gasPrice || record.gas_price) ? 
            (record.gasPrice || record.gas_price).toString() : '0';
            
          const gasValue = (record.gasValue || record.gas_value) ?
            (record.gasValue || record.gas_value).toString() : '0';
            
          const effectiveGasPrice = (record.effectiveGasPrice || record.effective_gas_price) ?
            (record.effectiveGasPrice || record.effective_gas_price).toString() : gasPrice; // Default to gasPrice if not available
            
          // If we have gasUsed and gasPrice but no gasValue, calculate it
          let calculatedGasValue = gasValue;
          if (gasValue === '0' && gasUsed !== '0' && gasPrice !== '0') {
            try {
              // Prefer using effectiveGasPrice for the calculation if available
              const priceToUse = effectiveGasPrice !== '0' ? effectiveGasPrice : gasPrice;
              const calculatedValue = BigInt(gasUsed) * BigInt(priceToUse);
              calculatedGasValue = calculatedValue.toString();
              console.log(`Calculated missing gasValue for tx ${record.transactionHash || record.transaction_hash}: ${calculatedGasValue}`);
            } catch (calcError) {
              console.warn(`Could not calculate gasValue: ${calcError.message}`);
            }
          }
          
          // If we have gasValue but no individual components, log it
          if (gasValue !== '0' && (gasUsed === '0' || gasPrice === '0')) {
            console.log(`Record ${record.id}: Has gasValue but missing gasUsed or gasPrice`);
          }
          
          // Log if effectiveGasPrice differs from gasPrice (indicating EIP-1559 transaction)
          if (effectiveGasPrice !== '0' && gasPrice !== '0' && effectiveGasPrice !== gasPrice) {
            console.log(`Record ${record.id}: EIP-1559 transaction with different pricing (effective: ${effectiveGasPrice}, base: ${gasPrice})`);
          }
          
          await writer.appendRow({
            id: record.id || `${record.blockNumber || record.block_number}-${record.transactionIndex || record.transaction_index || 0}`,
            blockNumber: BigInt(record.blockNumber || record.block_number || 0),
            transactionHash: record.transactionHash || record.transaction_hash || '',
            sender: record.from || record.sender || '',
            recipient: record.to || record.recipient || '',
            gasValue: calculatedGasValue,
            gasUsed: gasUsed,
            gasPrice: gasPrice,
            effectiveGasPrice: effectiveGasPrice
          });
        }
        
        totalRows += records.length;
        console.log(`Total records processed so far: ${totalRows}`);
        
        // Continue pagination only if we received a full batch
        hasMoreData = records.length === batchSize;
        offset += records.length;
      } catch (error) {
        console.error('Error fetching data batch:', error.message);
        hasMoreData = false;
      }
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} gas records to ${outputPath}`);
    return { success: true, count: totalRows };
  } catch (error) {
    console.error('Error in fetchPonderData:', error);
    return { success: false, error: error.message };
  } finally {
    // Close the database connection
    try {
      await client.end();
      console.log('Database connection closed');
    } catch (closeError) {
      console.error('Error closing database connection:', closeError.message);
    }
  }
}

// Main function
async function main() {
  console.log('Starting data collection from Ponder for case 4...');
  
  const result = await fetchPonderData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} gas records from Ponder`);
    
    // Verify file
    if (result.count > 0) {
      try {
        const stats = fs.statSync(outputPath);
        console.log(`Parquet file size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
        
        // Try to read the first few records to verify
        const reader = await parquet.ParquetReader.openFile(outputPath);
        const cursor = reader.getCursor();
        const sampleRecords = await cursor.next(5);
        console.log('Sample records:', JSON.stringify(sampleRecords, null, 2));
        
        const totalRows = reader.getRowCount();
        console.log(`Total rows in Parquet file: ${totalRows}`);
        
        reader.close();
      } catch (verifyError) {
        console.error('Error verifying file:', verifyError);
      }
    }
  } else {
    console.error(`Failed to collect Ponder data: ${result.error}`);
  }
  
  console.log('Data collection complete!');
}

// Run the main function
main().catch(error => {
  console.error('Error in main execution:', error);
  process.exit(1);
});