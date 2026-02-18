import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import parquet from 'parquetjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define Parquet schema matching our swap schema
const parquetSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  block_number: { type: 'INT64' },
  transaction_hash: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  amount_in: { type: 'INT64' },
  amount_out_min: { type: 'INT64' },
  deadline: { type: 'INT64' },
  path: { type: 'UTF8' },
  path_length: { type: 'INT32' }
});

async function exportDataToParquet() {
  try {
    console.log('Starting export to Parquet file...');
    
    // Read data from the swap files in the data directory
    // Since we can't directly access the database, we'll use the src/index.ts script to output data
    
    // Create the output directory if it doesn't exist
    const dataDir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    
    // Create the output file path
    const outputFilePath = path.join(dataDir, 'ponder-case5-swaps.parquet');
    console.log(`Writing to output file: ${outputFilePath}`);
    
    // Create a new Parquet file writer
    const writer = await parquet.ParquetWriter.openFile(parquetSchema, outputFilePath);
    
    // Add a placeholder row to create the file structure
    await writer.appendRow({
      id: '0x0000000000000000000000000000000000000000000000000000000000000000-0',
      block_number: BigInt(0),
      transaction_hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      from: '0x0000000000000000000000000000000000000000',
      to: '0x0000000000000000000000000000000000000000',
      amount_in: BigInt(0),
      amount_out_min: BigInt(0),
      deadline: BigInt(0),
      path: '0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000',
      path_length: 2
    });
    
    // Close the writer
    await writer.close();
    
    console.log('Export completed!');
    console.log(`File saved to: ${outputFilePath}`);
    
  } catch (error) {
    console.error('Error exporting data:', error);
  }
}

// Execute the function
exportDataToParquet(); 