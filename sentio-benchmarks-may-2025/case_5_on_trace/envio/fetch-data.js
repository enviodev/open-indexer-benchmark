import { HypersyncClient, BlockField, TraceField, TransactionField } from "@envio-dev/hypersync-client";
import { BigNumber } from 'bignumber.js';
import { keccak256, toHex } from 'viem';
import * as fs from 'fs';
import path from 'path';
import parquet from 'parquetjs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);

// Set up constants
const UNISWAP_V2_ROUTER = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'.toLowerCase();
const SWAP_METHOD_SIGNATURE = '0x38ed1739'; // swapExactTokensForTokens
const START_BLOCK = 22200000;
const END_BLOCK = 22290000;
const PARQUET_OUTPUT_PATH = '../data/envio-case5-swaps.parquet';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create output directories if they don't exist
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Define schema for Parquet file - Using standardized schema
const swapSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    blockNumber: { type: 'INT64' },
    transactionHash: { type: 'UTF8' },
    from: { type: 'UTF8' },
    to: { type: 'UTF8' },
    amountIn: { type: 'UTF8' }, // Store as string to preserve precision
    amountOutMin: { type: 'UTF8' }, // Store as string to preserve precision
    deadline: { type: 'UTF8' }, // Store as string to preserve precision
    path: { type: 'UTF8' }, // Comma-separated path of token addresses
    pathLength: { type: 'INT32' }
});

// Function to decode parameters from trace input
function decodeSwapParams(input) {
  if (!input || !input.startsWith(SWAP_METHOD_SIGNATURE)) {
    return null;
  }

  try {
    // Remove method signature (first 10 characters including '0x')
    const parametersHex = `0x${input.slice(10)}`;
    
    // Extract fixed parameters at specific offsets
    // According to the ABI, the order is:
    // 1. amountIn (uint256)
    // 2. amountOutMin (uint256)
    // 3. path (address[]) - dynamic type with offset pointer
    // 4. to (address)
    // 5. deadline (uint256)
    
    const amountInHex = parametersHex.slice(2, 66);
    const amountOutMinHex = parametersHex.slice(66, 130);
    // Position 130-194 contains a pointer to the path array (dynamic type), not the deadline
    const pathPointerHex = parametersHex.slice(130, 194);
    // The 'to' address is the 4th parameter
    const toHex = parametersHex.slice(194, 258);
    // The deadline is the 5th parameter
    const deadlineHex = parametersHex.slice(258, 322);
    
    // Parse fixed parameters
    const amountIn = new BigNumber(`0x${amountInHex}`).toString(10);
    const amountOutMin = new BigNumber(`0x${amountOutMinHex}`).toString(10);
    const deadline = new BigNumber(`0x${deadlineHex}`).toString(10);
    
    // Extract the 'to' address (recipient)
    const to = `0x${toHex.slice(24)}`.toLowerCase();
    
    // Parse the path array (dynamic type)
    // The pathPointer tells us the offset where the path array starts
    const pathPointer = parseInt(`0x${pathPointerHex}`, 16);
    // Calculate the actual offset in the hex string (each character is 0.5 bytes)
    const pathOffset = 2 + (pathPointer * 2);
    
    // The first 32 bytes at path location contain the length of the array
    const pathLengthHex = parametersHex.slice(pathOffset, pathOffset + 64);
    const pathLength = parseInt(`0x${pathLengthHex}`, 16);
    
    // Now extract all tokens in the path
    const pathTokens = [];
    for (let i = 0; i < pathLength && i < 10; i++) { // Limit to 10 tokens to prevent errors
      const tokenOffset = pathOffset + 64 + (i * 64);
      if (tokenOffset + 64 > parametersHex.length) {
        console.warn('Path extraction reached end of input data');
        break;
      }
      const tokenHex = parametersHex.slice(tokenOffset, tokenOffset + 64);
      const tokenAddress = `0x${tokenHex.slice(24)}`;
      // Validate and normalize address
      if (tokenAddress && tokenAddress.length === 42) {
        pathTokens.push(tokenAddress.toLowerCase()); // Normalize to lowercase
      }
    }
    
    // Combine all tokens into a path string
    const pathString = pathTokens.join(',');
    
    return {
      pathTokens,
      pathString,
      pathLength,
      amountIn,
      amountOutMin,
      deadline,
      to
    };
  } catch (error) {
    console.error('Error decoding swap parameters:', error);
    return null;
  }
}

async function main() {
  // Initialize data structures for collecting swap info
  const swapRecords = [];
  const uniqueInputTokens = new Set();
  const uniqueOutputTokens = new Set();
  const uniqueRecipients = new Set();
  const inputAmounts = [];
  let totalTraces = 0;
  let successfulDecodes = 0;
  
  // Start measuring time
  const startTime = performance.now();
  
  try {
    // Initialize HyperSync client
    const client = await HypersyncClient.new({
      url: "https://eth-traces.hypersync.xyz",
      maxRetries: 3,
      retryDelay: 1000,
    });

    console.log("HyperSync client initialized");
    
    // First, query to get the traces
    const traceQuery = {
      fromBlock: START_BLOCK,
      toBlock: END_BLOCK,
      traces: [
        {
          to: [UNISWAP_V2_ROUTER]
        }
      ],
      fieldSelection: {
        trace: [
          TraceField.TransactionHash,
          TraceField.BlockNumber,
          TraceField.From,
          TraceField.To,
          TraceField.Input,
          TraceField.Value,
          TraceField.CallType,
          TraceField.TraceAddress
        ],
        transaction: [
          TransactionField.Hash,
          TransactionField.From,
          TransactionField.To,
          TransactionField.BlockNumber,
          TransactionField.Status // Include status field
        ],
        block: [
          BlockField.Number,
          BlockField.Timestamp,
        ]
      },
      // Ensure we get the associated transaction data with each trace
      // 0 = Default, 1 = JoinAll, 2 = JoinNothing
      joinMode: 1
    };
    
    // Add more debug logs for the query
    console.log("Query details:", JSON.stringify({
      blockRange: `${START_BLOCK}-${END_BLOCK}`,
      filterTarget: UNISWAP_V2_ROUTER,
      hasTransactionFilter: !!traceQuery.transactions
    }));
    
    // More logging before streaming
    console.log('Starting to stream traces, this might take a while...');
    
    // Add timeout handling for the stream operation
    let streamTimeout = setTimeout(() => {
      console.error("Stream operation timed out after 60 seconds. The HyperSync service might be experiencing issues.");
      console.error("Check the status of the service or try again later.");
      process.exit(1);
    }, 60000); // 60 second timeout
    
    // Use stream API for traces
    const traceStream = await client.stream(traceQuery, {});
    clearTimeout(streamTimeout); // Clear timeout if stream initialized successfully
    console.log('Stream connected successfully. Waiting for data...');
    
    // Add timeout handling for each recv operation
    while (true) {
      console.log('Waiting for next batch of data...');
      let recvTimeout = setTimeout(() => {
        console.error("Receive operation timed out after 30 seconds.");
        console.error("This might indicate network issues or heavy load on the HyperSync service.");
        // Don't exit here, just log the warning
      }, 30000); // 30 second timeout

      const res = await traceStream.recv();
      clearTimeout(recvTimeout); // Clear timeout if received successfully
      
      // Log what we received
      if (res === null) {
        console.log("End of trace data reached (received null)");
        break;
      } else {
        console.log(`Received data with nextBlock: ${res.nextBlock}, traces: ${res.data?.traces?.length || 0}`);
      }
      
      // Skip if no trace data
      if (!res.data || !res.data.traces) {
        continue;
      }
      
      // Process the results
      const traces = res.data.traces;
      const transactions = res.data.transactions || [];
      const blockNumber = res.data.block?.number || 0;
      
      totalTraces += traces.length;
      
      // Process each trace
      for (const trace of traces) {
        if (trace.to && trace.to.toLowerCase() === UNISWAP_V2_ROUTER && 
            trace.input && trace.input.startsWith(SWAP_METHOD_SIGNATURE)) {
          
          const swapParams = decodeSwapParams(trace.input);
          if (swapParams) {
            successfulDecodes++;
            
            const txHash = trace.transactionHash.toLowerCase();
            const traceAddress = trace.traceAddress?.join('-') || '0';
            
            // Create a standardized ID format
            const id = `${txHash}-${traceAddress}`;
            
            // Get the trace-level sender address
            const traceFromAddress = (trace.from || "").toLowerCase();
            
            // Find the matching transaction directly
            const tx = transactions.find(t => t.hash && t.hash.toLowerCase() === txHash);
            const txFrom = tx && tx.from ? tx.from.toLowerCase() : "";
            
            // Log transaction status to verify it's being returned
            if (tx) {
              console.log(`Transaction ${txHash.substring(0, 10)}... status: ${tx.status}`);
            } else {
              console.log(`No transaction found for trace with hash ${txHash.substring(0, 10)}...`);
            }
            
            // Use transaction-level sender if available, otherwise fall back to trace-level
            const fromAddress = txFrom || traceFromAddress;
            
            // Store the record with the EOA sender address
            swapRecords.push({
              id: id,
              blockNumber: trace.blockNumber || blockNumber,
              transactionHash: txHash,
              from: fromAddress,
              to: swapParams.to,
              amountIn: swapParams.amountIn,
              amountOutMin: swapParams.amountOutMin,
              deadline: swapParams.deadline,
              path: swapParams.pathString,
              pathLength: swapParams.pathLength
            });
            
            // Track statistics
            if (swapParams.pathTokens.length > 0) {
              uniqueInputTokens.add(swapParams.pathTokens[0]);
              uniqueOutputTokens.add(swapParams.pathTokens[swapParams.pathTokens.length - 1]);
            }
            uniqueRecipients.add(swapParams.to);
            inputAmounts.push(new BigNumber(swapParams.amountIn));
          }
        }
      }
    }
    
    console.log(`\nData collection complete.`);
    console.log(`Processed ${END_BLOCK - START_BLOCK} blocks`);
    console.log(`Processed ${totalTraces} traces`);
    console.log(`Collected ${swapRecords.length} swap records`);
    console.log(`Total execution time: ${((performance.now() - startTime) / 1000).toFixed(2)} seconds`);
    
    // Save to Parquet format
    if (swapRecords.length > 0) {
      const writer = await parquet.ParquetWriter.openFile(swapSchema, path.resolve(__dirname, PARQUET_OUTPUT_PATH));
      
      for (const record of swapRecords) {
        await writer.appendRow(record);
      }
      
      await writer.close();
      console.log(`Data saved to ${PARQUET_OUTPUT_PATH}`);
    } else {
      console.log('No swap records found, skipping Parquet file creation');
    }
    
  } catch (error) {
    console.error('Error collecting swap data:', error);
  }
}

main().catch(console.error); 