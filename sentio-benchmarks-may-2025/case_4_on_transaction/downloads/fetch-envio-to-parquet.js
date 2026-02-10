const fs = require('fs');
const path = require('path');
const { HypersyncClient } = require('@envio-dev/hypersync-client');
const parquet = require('parquetjs');

// Create output directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Output file path
const outputPath = path.join(dataDir, 'envio-case4-gas.parquet');

// Configuration for case_4
const START_BLOCK = 22280000;
const END_BLOCK = 22290000;
const BATCH_SIZE = 1000;

// Define the Parquet schema for gas records
const gasSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  transactionHash: { type: 'UTF8' },
  sender: { type: 'UTF8' },
  recipient: { type: 'UTF8' },
  gasValue: { type: 'UTF8' }, // Using UTF8 for large numbers
  gasUsed: { type: 'UTF8' }, // Explicitly storing for consistency
  gasPrice: { type: 'UTF8' },  // Explicitly storing for consistency
  effectiveGasPrice: { type: 'UTF8' } // Added to track EIP-1559 gas pricing
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
    
    // Create a Parquet writer
    const writer = await parquet.ParquetWriter.openFile(gasSchema, outputPath);
    
    // Initialize HyperSync client
    const client = await HypersyncClient.new({
      url: 'https://eth.hypersync.xyz'
    });
    
    // Initialize stats
    let totalTransactions = 0;
    const startTime = Date.now();
    
    // Create a query following HyperSync documentation
    const query = {
      fromBlock: START_BLOCK,
      toBlock: END_BLOCK,
      // We want all transactions in the block range
      transactions: [{}],
      // Explicitly select all the fields we need
      fieldSelection: {
        transaction: [
          "hash", "from", "to", "gas", "gasUsed", "gasPrice", 
          "effectiveGasPrice", "value", "input"
        ],
        block: ["number", "timestamp"]
      },
      // Only get blocks with transactions
      includeAllBlocks: false,
      // Set reasonable limits
      maxNumBlocks: 1000,
      maxNumTransactions: 10000
    };
    
    console.log('Starting data stream...');
    
    // Use stream function to process data in chunks
    const stream = await client.stream(query, {});
    let processedTransactions = 0;
    
    while (true) {
      const result = await stream.recv();
      
      // Check if we've reached the end of the stream
      if (!result) {
        console.log('End of stream reached.');
        break;
      }
      
      // Process blocks and transactions
      if (result.data && result.data.transactions) {
        const transactions = result.data.transactions;
        console.log(`Received ${transactions.length} transactions`);
        
        for (const tx of transactions) {
          processedTransactions++;
          
          try {
            // Extract and normalize gas metrics (convert hex to decimal strings)
            const gasUsedRaw = tx.gasUsed || '0';
            const gasPriceRaw = tx.gasPrice || '0';
            const effectiveGasPriceRaw = tx.effectiveGasPrice || tx.gasPrice || '0';
            
            // Convert any hex values to decimal strings
            const gasUsed = hexToDecimalString(gasUsedRaw);
            const gasPrice = hexToDecimalString(gasPriceRaw);
            const effectiveGasPrice = hexToDecimalString(effectiveGasPriceRaw);
            
            // Calculate gas value as gasUsed * effectiveGasPrice
            const gasValueBigInt = BigInt(gasUsed) * BigInt(effectiveGasPrice);
            const gasValue = gasValueBigInt.toString();
            
            // Debug logging for the first few transactions
            if (processedTransactions <= 5) {
              console.log(`Gas Calculation Details for tx ${tx.hash}:`);
              console.log(`- gasUsed: ${gasUsedRaw} → ${gasUsed}`);
              console.log(`- gasPrice: ${gasPriceRaw} → ${gasPrice}`);
              console.log(`- effectiveGasPrice: ${effectiveGasPriceRaw} → ${effectiveGasPrice}`);
              console.log(`- gasValue (gasUsed * effectiveGasPrice): ${gasValue}`);
            }
            
            // Store the gas record
            await writer.appendRow({
              id: tx.hash,
              blockNumber: BigInt(tx.blockNumber || 0),
              transactionHash: tx.hash,
              sender: tx.from.toLowerCase(),
              recipient: (tx.to || '0x0').toLowerCase(),
              gasValue: gasValue,
              gasUsed: gasUsed,
              gasPrice: gasPrice,
              effectiveGasPrice: effectiveGasPrice
            });
            
            totalTransactions++;
            
            // Log progress every 1000 transactions
            if (totalTransactions % 1000 === 0) {
              const elapsedSecs = (Date.now() - startTime) / 1000;
              const txPerSec = totalTransactions / elapsedSecs;
              console.log(`Processed ${totalTransactions} transactions (${txPerSec.toFixed(2)}/sec)`);
            }
          } catch (err) {
            console.warn(`Error processing transaction: ${err.message}`);
          }
        }
      } else {
        console.log('No transactions in this batch.');
      }
      
      // Display progress based on next_block
      if (result.next_block) {
        const progress = ((result.next_block - START_BLOCK) / (END_BLOCK - START_BLOCK) * 100).toFixed(2);
        console.log(`Progress: ${progress}% (Block ${result.next_block} of ${END_BLOCK})`);
      }
    }
    
    // Close the stream
    await stream.close();
    
    // Close the writer
    await writer.close();
    
    // Log summary
    const elapsedSecs = (Date.now() - startTime) / 1000;
    console.log('\n--- DATA SUMMARY ---');
    console.log(`Total transactions processed: ${totalTransactions}`);
    console.log(`Processing rate: ${(totalTransactions / elapsedSecs).toFixed(2)} tx/sec`);
    console.log(`Total execution time: ${elapsedSecs.toFixed(2)} seconds`);
    
    // Get and log file size
    const fileStats = fs.statSync(outputPath);
    console.log(`Output file size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);
    
    return { success: true, count: totalTransactions };
  } catch (error) {
    console.error('Error in fetchGasData:', error);
    return { success: false, error: error.message };
  }
}

// Main function
async function main() {
  console.log('Starting data collection from Envio for case 4...');
  
  const result = await fetchGasData();
  
  if (result.success) {
    console.log(`Successfully collected ${result.count} gas records from Envio`);
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