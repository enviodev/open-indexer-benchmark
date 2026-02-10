// Script to fetch transaction gas data using HyperSync client and save to Parquet
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HypersyncClient } from '@envio-dev/hypersync-client';
import { BigNumber } from 'bignumber.js';
import parquet from 'parquetjs';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get HyperSync URL from environment variable
const HYPERSYNC_URL = process.env.HYPERSYNC_URL;
if (!HYPERSYNC_URL) {
  console.error("ERROR: HYPERSYNC_URL environment variable is required");
  process.exit(1);
}

// Get HyperSync API key from environment variable (optional)
const HYPERSYNC_API_KEY = process.env.HYPERSYNC_API_KEY;

// Configuration - using the specified block range for case_4
const OUTPUT_PARQUET_FILE = path.join(__dirname, '../data/envio-case4-gas.parquet');
const START_BLOCK = 22280000;
const END_BLOCK = 22290000;
const BATCH_SIZE = 100; // Larger batch size

// Define the Parquet schema
const gasDataSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  gasValue: { type: 'UTF8' }, // Using STRING for big numbers to avoid overflow
  gasUsed: { type: 'UTF8' }, // Gas used by the transaction
  gasPrice: { type: 'UTF8' }, // Base gas price
  effectiveGasPrice: { type: 'UTF8' }, // Effective gas price (for EIP-1559 transactions)
  blockNumber: { type: 'INT64' },
  timestamp: { type: 'INT64' }
});

// Helper function to convert hex values to decimal strings
function hexToDecimalString(hexValue) {
  if (typeof hexValue === 'string' && hexValue.startsWith('0x')) {
    return BigInt(hexValue).toString();
  }
  return hexValue ? hexValue.toString() : '0';
}

async function fetchGasData() {
  try {
    console.log('=== HYPERSYNC GAS DATA COLLECTION ===');
    console.log(`Starting gas data collection from block ${START_BLOCK} to ${END_BLOCK}`);
    
    // Make sure output directory exists
    const outputDir = path.dirname(OUTPUT_PARQUET_FILE);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create client - use the static method to initialize
    const client = await HypersyncClient.new({
      url: HYPERSYNC_URL,
      apiKey: HYPERSYNC_API_KEY || undefined // Only pass if defined
    });
    
    // Initialize stats and timers
    const startTime = Date.now();
    let transactions = [];
    let processedBlocks = 0;
    let processedTxs = 0;

    for (let currentBlock = START_BLOCK; currentBlock < END_BLOCK; currentBlock += BATCH_SIZE) {
      const batchEndBlock = Math.min(currentBlock + BATCH_SIZE, END_BLOCK);
      
      try {
        // Define query for this batch - explicitly request all relevant fields
        const query = {
          fromBlock: currentBlock,
          toBlock: batchEndBlock,
          transactions: [{}], // Get all transactions
          fieldSelection: {
            transaction: ["hash", "from", "to", "gas", "gas_used", "gas_price", "effective_gas_price", "value", "input", "receipt"],
            block: ["number", "timestamp"]
          }
        };
        console.log(query);
        
        // Start streaming for this batch
        const stream = await client.stream(query, {});
        
        let anyDataReceived = false;
        
        // Process results from the stream
        while (true) {
          const result = await stream.recv();
          
          // Check if we've reached the end of the stream
          if (!result || !result.data) {
            if (!anyDataReceived) {
              console.log('No data received in this batch.');
            } else {
              console.log('End of batch reached.');
            }
            break;
          }
          
          anyDataReceived = true;
          
          // Log data keys for debugging
          console.log(`Received data with keys: ${Object.keys(result.data).join(', ')}`);
          
          // Process blocks
          if (result.data.blocks && result.data.blocks.length > 0) {
            processedBlocks += result.data.blocks.length;
            console.log(`Received ${result.data.blocks.length} blocks`);
            
            // Create a map of blocks by number
            const blockMap = {};
            for (const block of result.data.blocks) {
              if (block.number) {
                blockMap[block.number] = {
                  number: block.number,
                  timestamp: block.timestamp || 0
                };
              }
            }
            
            // Process transactions if any
            if (result.data.transactions && result.data.transactions.length > 0) {
              console.log(`Received ${result.data.transactions.length} transactions`);
              
              // Debug: Log detailed info for the first transaction
              if (result.data.transactions.length > 0 && processedTxs === 0) {
                const sampleTx = result.data.transactions[0];
                console.log("Sample Transaction Details:");
                console.log("- Hash:", sampleTx.hash);
                console.log("- From:", sampleTx.from);
                console.log("- To:", sampleTx.to);
                console.log("- Gas:", sampleTx.gas, typeof sampleTx.gas);
                console.log("- GasUsed:", sampleTx.gasUsed, typeof sampleTx.gasUsed);
                console.log("- GasPrice:", sampleTx.gasPrice, typeof sampleTx.gasPrice);
                console.log("- Value:", sampleTx.value);
                console.log("- Input length:", sampleTx.input ? sampleTx.input.length : 0);
              }
              
              // Process each transaction
              for (let i = 0; i < result.data.transactions.length; i++) {
                const tx = result.data.transactions[i];
                
                try {
                  // Skip transactions without required data
                  if (!tx.hash || !tx.from) {
                    continue;
                  }
                  
                  // Find the corresponding block for this transaction
                  let blockNumber = currentBlock;
                  let timestamp = 0;
                  
                  // Find the corresponding block for this transaction
                  if (result.data.blocks && result.data.blocks.length > 0) {
                    const firstBlock = result.data.blocks[0];
                    blockNumber = firstBlock.number || currentBlock;
                    timestamp = firstBlock.timestamp || 0;
                  }
                  
                  // Get actual gasUsed and gasPrice
                  const gasUsedRaw = tx.gasUsed || '0';
                  const gasPriceRaw = tx.gasPrice || '0';
                  const effectiveGasPriceRaw = tx.effectiveGasPrice || tx.gasPrice || '0';
                  
                  // Convert any hex values to decimal strings
                  const gasUsed = hexToDecimalString(gasUsedRaw);
                  const gasPrice = hexToDecimalString(gasPriceRaw);
                  const effectiveGasPrice = hexToDecimalString(effectiveGasPriceRaw);
                  
                  // Calculate gas value as gasUsed * gasPrice
                  const gasValueBigInt = BigInt(gasUsed) * BigInt(effectiveGasPrice);
                  const gasValue = gasValueBigInt.toString();
                  
                  // Debug logging for gas calculation for the first few transactions
                  if (processedTxs < 5) {
                    console.log(`Gas Calculation Details for tx ${tx.hash}:`);
                    console.log(`- gasUsed: ${gasUsedRaw} → ${gasUsed}`);
                    console.log(`- gasPrice: ${gasPriceRaw} → ${gasPrice}`);
                    console.log(`- effectiveGasPrice: ${effectiveGasPriceRaw} → ${effectiveGasPrice}`);
                    console.log(`- gasValue (gasUsed * effectiveGasPrice): ${gasValue}`);
                  }
                  
                  // Create the gas record
                  transactions.push({
                    id: tx.hash,
                    from: tx.from.toLowerCase(),
                    to: (tx.to || '0x0').toLowerCase(),
                    gasValue,
                    gasUsed,
                    gasPrice,
                    effectiveGasPrice,
                    blockNumber: blockNumber,
                    timestamp: timestamp
                  });
                  
                  processedTxs++;
                  
                  // Log every 10000 transactions
                  if (processedTxs % 10000 === 0) {
                    console.log(`Processed ${processedTxs} transactions so far...`);
                    
                    // Show a sample record
                    if (transactions.length > 0) {
                      const sample = transactions[transactions.length - 1];
                      console.log('Sample record:');
                      console.log(`  Hash: ${sample.id}`);
                      console.log(`  From: ${sample.from}`);
                      console.log(`  To: ${sample.to}`);
                      console.log(`  Gas Value: ${sample.gasValue}`);
                      console.log(`  Gas Used: ${sample.gasUsed}`);
                      console.log(`  Gas Price: ${sample.gasPrice}`);
                      console.log(`  Effective Gas Price: ${sample.effectiveGasPrice || 'N/A'}`);
                      console.log(`  Block: ${sample.blockNumber}`);
                    }
                  }
                } catch (err) {
                  // Skip problematic transactions
                  console.warn(`Error processing transaction ${i}: ${err.message}`);
                }
              }
            } else {
              console.log('No transactions in this batch.');
            }
          } else {
            console.log('No blocks in this batch.');
          }
        }
        
        // Log progress after each batch
        const elapsedSecs = (Date.now() - startTime) / 1000;
        const blocksPerSec = processedBlocks / elapsedSecs;
        const txsPerSec = processedTxs / elapsedSecs;
        const percentComplete = (100 * (batchEndBlock - START_BLOCK) / (END_BLOCK - START_BLOCK)).toFixed(2);
        
        console.log(`Progress: ${processedBlocks} blocks (${blocksPerSec.toFixed(2)}/sec), ${processedTxs} transactions (${txsPerSec.toFixed(2)}/sec)`);
        console.log(`Current position: Block ${batchEndBlock} of ${END_BLOCK} (${percentComplete}%)`);
        
      } catch (error) {
        console.error(`Error in block range ${currentBlock}-${batchEndBlock}: ${error.message}`);
        // Continue with the next batch
      }
    }
    
    console.log('Data collection complete.');
    
    // Calculate summary statistics
    const uniqueSenders = transactions.length > 0 ? new Set(transactions.map(tx => tx.from)).size : 0;
    const uniqueRecipients = transactions.length > 0 ? new Set(transactions.map(tx => tx.to)).size : 0;
    
    // Calculate total gas value
    let totalGasValue = BigInt(0);
    for (const tx of transactions) {
      totalGasValue += BigInt(tx.gasValue);
    }
    
    // Log results
    console.log('\n--- DATA SUMMARY ---');
    console.log(`Total blocks processed: ${processedBlocks}`);
    console.log(`Gas records collected: ${transactions.length}`);
    console.log(`Unique senders: ${uniqueSenders}`);
    console.log(`Unique recipients: ${uniqueRecipients}`);
    console.log(`Total gas value: ${totalGasValue.toString()} wei`);
    console.log(`Average gas value per tx: ${transactions.length > 0 ? (totalGasValue / BigInt(transactions.length)).toString() : 0} wei`);
    console.log(`Total execution time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);
    
    if (transactions.length > 0) {
      console.log('\nSample record:');
      console.log(`  Id: ${transactions[0].id}`);
      console.log(`  From: ${transactions[0].from}`);
      console.log(`  To: ${transactions[0].to}`);
      console.log(`  Gas Value: ${transactions[0].gasValue}`);
      console.log(`  Gas Used: ${transactions[0].gasUsed}`);
      console.log(`  Gas Price: ${transactions[0].gasPrice}`);
      console.log(`  Effective Gas Price: ${transactions[0].effectiveGasPrice || 'N/A'}`);
      console.log(`  Block Number: ${transactions[0].blockNumber}`);
    } else {
      console.log('\nNo transactions found in the specified block range');
    }
    // Save to Parquet file
    await saveToParquet(transactions);
    
  } catch (error) {
    console.error('Error fetching data:', error.message);
    console.error(error);
  }
}

// Function to save data to Parquet format
async function saveToParquet(transactions) {
  try {
    // Create a new Parquet file writer
    const writer = await parquet.ParquetWriter.openFile(gasDataSchema, OUTPUT_PARQUET_FILE);
    
    console.log(`Writing ${transactions.length} records to Parquet file...`);
    
    // Write each transaction to the Parquet file
    for (const tx of transactions) {
      await writer.appendRow({
        id: tx.id,
        from: tx.from,
        to: tx.to,
        gasValue: tx.gasValue, // Already a string
        gasUsed: tx.gasUsed,
        gasPrice: tx.gasPrice,
        effectiveGasPrice: tx.effectiveGasPrice || '0',
        blockNumber: tx.blockNumber,
        timestamp: tx.timestamp
      });
    }
    
    // Close the writer to ensure file is properly written
    await writer.close();
    
    console.log(`Data saved to Parquet file: ${OUTPUT_PARQUET_FILE}`);
    console.log(`Parquet file size: ${(fs.statSync(OUTPUT_PARQUET_FILE).size / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('Error saving to Parquet:', error.message);
    console.error(error);
  }
}

// Create directories if they don't exist
const dataDir = path.dirname(OUTPUT_PARQUET_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created directory: ${dataDir}`);
}

// Execute the function
console.log('=== HYPERSYNC GAS DATA COLLECTION ===');
fetchGasData().catch(error => {
  console.error("Unhandled error in main function:", error);
}); 