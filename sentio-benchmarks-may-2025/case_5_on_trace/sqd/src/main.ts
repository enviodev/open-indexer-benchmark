import {TypeormDatabase} from '@subsquid/typeorm-store'
import {processor} from './processor.js'
import {Swap} from './model/generated/swap.model.js'
import * as fs from 'fs'
import * as path from 'path'
import * as parquet from 'parquetjs'

// Constants for chunked processing
const BATCH_SIZE = 5 // Process very small batches at a time
const DATA_DIR = '../data'
const PARQUET_FILENAME = 'subsquid-case5-swaps.parquet'

// Ensure data directory exists
try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Data directory ensured at ${path.resolve(DATA_DIR)}`);
} catch (error) {
    console.error(`Error creating data directory: ${error}`);
}

// Define Parquet schema matching our swap schema
const parquetSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    block_number: { type: 'INT64' },
    transaction_hash: { type: 'UTF8' },
    from: { type: 'UTF8' },
    to: { type: 'UTF8' },
    amount_in: { type: 'UTF8' },
    amount_out_min: { type: 'UTF8' },
    deadline: { type: 'UTF8' },
    path: { type: 'UTF8' },
    path_length: { type: 'INT32' }
});

// Helper function to safely convert hex string to BigInt
function hexToBigInt(hexString: string): bigint {
    // Make sure it's a valid hex string with at least one digit
    if (!hexString) {
        console.log(`hexToBigInt received undefined or null value`);
        return BigInt(0);
    }
    if (hexString === '0x' || hexString === '') {
        console.log(`hexToBigInt received empty hex string: "${hexString}"`);
        return BigInt(0);
    }
    
    // Check if it's a valid hex string
    if (!/^0x[0-9a-fA-F]+$/.test(hexString)) {
        console.log(`hexToBigInt received invalid hex string: "${hexString}"`);
        return BigInt(0);
    }
    
    return BigInt(hexString);
}

// Function to write swaps to Parquet file
async function writeSwapsToParquet(swaps: Swap[]) {
    if (swaps.length === 0) return;
    
    const filepath = path.join(DATA_DIR, PARQUET_FILENAME);
    console.log(`Writing ${swaps.length} swaps to ${filepath}`);
    
    try {
        // Create a new Parquet file writer
        const writer = await parquet.ParquetWriter.openFile(parquetSchema, filepath);
        
        // Write each swap to the file
        for (const swap of swaps) {
            await writer.appendRow({
                id: swap.id,
                block_number: Number(swap.blockNumber),
                transaction_hash: swap.transactionHash,
                from: swap.from,
                to: swap.to,
                amount_in: swap.amountIn.toString(),
                amount_out_min: swap.amountOutMin.toString(),
                deadline: swap.deadline.toString(),
                path: swap.path,
                path_length: swap.pathLength
            });
        }
        
        // Close the writer
        await writer.close();
        console.log(`✅ Successfully wrote Parquet file: ${filepath}`);
    } catch (error) {
        console.error(`❌ Error writing Parquet file: ${error}`);
    }
}

// Create an array to store all swaps for Parquet file
let allSwaps: Swap[] = [];

// Add a map to track swap counts per transaction
const txSwapCounters = new Map<string, number>();

processor.run(new TypeormDatabase(), async (ctx) => {
    // Process and store swaps block by block to reduce memory usage
    for (let block of ctx.blocks) {
        let blockSwaps: Swap[] = []
        let blockHeight = block.header.height
        
        // Clear transaction counters at the start of each block for memory efficiency
        txSwapCounters.clear();
        
        // Print current block for monitoring progress
        if (blockHeight % 1000 === 0) {
            ctx.log.info(`Processing block ${blockHeight}...`)
        }
        
        for (let trace of block.traces) {
            // Skip if trace doesn't have a transaction
            if (!trace.transaction) {
                continue
            }
            
            const transaction = trace.transaction;
            
            // Skip if not a call or doesn't have action
            if (trace.type !== 'call' || !('action' in trace)) {
                continue;
            }
            
            // Skip if action doesn't exist or doesn't have input
            if (!trace.action || !trace.action.input) {
                continue;
            }
            
            const input = trace.action.input
            
            // Skip if not a swapExactTokensForTokens call
            if (!input.startsWith('0x38ed1739')) {
                continue
            }
            
            // Let's log we found a potential swap
            // ctx.log.info(`Found potential swap in tx ${transaction.hash}`)
            
            // Skip function selector (first 4 bytes)
            const data = input.slice(10)
            
            // Basic validations - only skip for completely invalid data
            if (data.length < 64) {
                ctx.log.warn(`Data too short in tx ${transaction.hash}: ${data.length} chars`);
                continue;
            }
            
            try {
                // Parse amountIn (uint256) - first 32 bytes
                const amountIn = hexToBigInt('0x' + data.slice(0, 64))
                
                // Parse amountOutMin (uint256) - next 32 bytes
                const amountOutMin = hexToBigInt('0x' + data.slice(64, 128))
                
                // Parse the path array location - next 32 bytes
                const pathPointer = parseInt(data.slice(128, 192), 16)
                
                // Parse the to address - next 32 bytes (bytes 4-8 of the array)
                // The address is stored as a 20-byte value padded to 32 bytes
                const toAddressHex = '0x' + data.slice(192, 256).slice(24)
                const toAddress = toAddressHex.toLowerCase()
                
                // Parse deadline (uint256) - next 32 bytes after to address
                const deadline = hexToBigInt('0x' + data.slice(256, 320))
                
                // Properly decode the path array
                // First locate where the path array data starts in the calldata
                // The path offset points to the start of the array in the calldata
                // This offset is relative to the start of the input parameters
                const pathOffset = parseInt(data.slice(128, 192), 16) * 2; // Convert to hex string offset
                
                // At the path offset, we first have 32 bytes for array length
                const pathStartPos = pathOffset;
                
                let path: string[] = [];
                let pathLength = 0;
                
                if (data.length >= pathStartPos + 64) {
                  pathLength = parseInt(data.slice(pathStartPos, pathStartPos + 64), 16);
                  
                  // Extract each address in the path (each 32 bytes, with address in the last 20 bytes)
                  for (let i = 0; i < pathLength && pathStartPos + 64 + i * 64 + 64 <= data.length; i++) {
                    const addressPos = pathStartPos + 64 + i * 64;
                    const address = '0x' + data.slice(addressPos + 24, addressPos + 64).toLowerCase();
                    path.push(address);
                  }
                } else {
                  // Fallback if we can't read the path correctly
                  path = ['0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'];
                  pathLength = 2;
                  ctx.log.warn(`Could not extract path from data in tx ${transaction.hash}`);
                }
                
                // Create unique ID for this swap using trace address path
                const txHash = transaction.hash
                
                // Get trace address path - join with dash for consistent format
                // If not available, use '0' as default
                const traceAddressPath = trace.traceAddress ? trace.traceAddress.join('-') : '0';
                const id = `${txHash}-${traceAddressPath}`;
                
                // Get transaction sender as 'from'
                const fromAddress = transaction.from.toLowerCase()
                
                // Create swap entity
                const swap = new Swap({
                    id: id,
                    blockNumber: BigInt(blockHeight),
                    transactionHash: txHash,
                    from: fromAddress,
                    to: toAddress,
                    amountIn: amountIn,
                    amountOutMin: amountOutMin,
                    deadline: deadline,
                    path: path.join(','),
                    pathLength: pathLength
                })
                
                // Log successful swap creation with trace address
                // ctx.log.info(`Created swap in tx ${txHash} from ${fromAddress} with trace address ${traceAddressPath}`)
                
                // Add to current block batch
                blockSwaps.push(swap)
                
                // If we've reached the mini-batch size, save immediately to avoid memory accumulation
                if (blockSwaps.length >= BATCH_SIZE) {
                    await ctx.store.insert(blockSwaps)
                    // ctx.log.info(`Stored mini-batch of ${blockSwaps.length} swaps from block ${blockHeight}`)
                    
                    // Add to our collection for Parquet file
                    allSwaps.push(...blockSwaps)
                    
                    // Clear after saving to free memory
                    blockSwaps = []
                }
            } catch (error) {
                ctx.log.error(`Error processing swap in tx ${transaction.hash}: ${error}`)
            }
        }
        
        // Save any remaining swaps for this block
        if (blockSwaps.length > 0) {
            await ctx.store.insert(blockSwaps)
            // ctx.log.info(`Stored remaining ${blockSwaps.length} swaps from block ${blockHeight}`)
            
            // Add to our collection for Parquet file
            allSwaps.push(...blockSwaps)
        }
        
        // Force garbage collection between blocks if Node.js allows it
        if (global.gc) {
            try {
                global.gc()
                ctx.log.info(`Forced garbage collection after block ${blockHeight}`)
            } catch (e) {
                // Ignore if gc is not available
            }
        }
    }
    try {
        // Write all accumulated swaps to Parquet file
        if (allSwaps.length > 0) {
            ctx.log.info(`Writing ${allSwaps.length} total swaps to Parquet file...`)
        await writeSwapsToParquet(allSwaps)
        
        // Clear for memory efficiency
        allSwaps = []
    }
    } catch (error) {
        ctx.log.error(`Error writing swaps to Parquet file: ${error}`)
    }
    
    ctx.log.info(`Completed processing blocks ${ctx.blocks[0].header.height} to ${ctx.blocks[ctx.blocks.length-1].header.height}`)
}) 