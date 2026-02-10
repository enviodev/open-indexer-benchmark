// @ts-ignore - Ignore 'ponder' module not found errors
import { createPublicClient, http } from "viem";
// @ts-ignore
import { ponder } from "ponder:registry";
import { gasSpent } from "../ponder.schema";
import { mainnet } from "viem/chains";

// Connect to the Ethereum network using Viem client
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.PONDER_RPC_URL_1),
});

// Counter for monitoring progress
let processedCount = 0;
let successCount = 0;
let errorCount = 0;

// @ts-ignore - Type issue with event
ponder.on("ethereum:block", async ({ event, context }) => {
  // @ts-ignore - Type issue with block
  const block = event.block;
  
  try {
    // Log progress every 10 blocks
    if (Number(block.number) % 10 === 0) {
      console.log(`PROGRESS: Processing block ${block.number}, processed ${processedCount} transactions (${successCount} successes, ${errorCount} errors)`);
    }

    // Get the block with transactions using the correct Viem method
    const blockWithTransactions = await publicClient.getBlock({
      blockNumber: BigInt(block.number),
      includeTransactions: true
    });

    // Process each transaction in the block
    // @ts-ignore - Type issues with transactions
    for (const tx of blockWithTransactions.transactions) {
      processedCount++;
      try {
        // Get the transaction receipt to get the gasUsed value
        const receipt = await publicClient.getTransactionReceipt({
          hash: tx.hash,
        });

        // EIP-1559 handling
        // @ts-ignore - Type issues with tx properties
        const gasPrice = tx.gasPrice || BigInt(0);
        // @ts-ignore - Type issue with effectiveGasPrice
        const effectiveGasPrice = receipt.effectiveGasPrice || undefined;
        const gasUsed = receipt.gasUsed;

        // Use effectiveGasPrice if available, otherwise fall back to gasPrice
        const priceForCalculation = effectiveGasPrice !== undefined ? effectiveGasPrice : gasPrice;
        const gasValue = priceForCalculation * gasUsed;

        // Prepare the transaction data
        const txData = {
          id: tx.hash,
          // @ts-ignore - Type issues with tx properties - Updated field name
          from_address: tx.from,
          // @ts-ignore - Type issues with tx properties - Updated field name
          to_address: tx.to || "0x0000000000000000000000000000000000000000",
          gasValueString: gasValue.toString(),
          gasUsedString: gasUsed.toString(),
          gasPriceString: gasPrice.toString(),
          effectiveGasPriceString: effectiveGasPrice !== undefined ? effectiveGasPrice.toString() : null,
          blockNumberString: block.number.toString(),
          transactionHash: tx.hash,
        };

        // Log before DB insert (debugging)
        console.log(`DB_INSERT_ATTEMPT: Attempting to insert tx ${tx.hash} into database`);
        
        // Store transaction with gas value
        // @ts-ignore - Type issues with context.db
        await context.db.insert(gasSpent, txData);
        
        successCount++;
        console.log(`DB_INSERT_SUCCESS: Successfully inserted tx ${tx.hash} with gas value ${gasValue}`);
      } catch (error) {
        errorCount++;
        console.error(`DB_INSERT_ERROR: Failed to process transaction ${tx.hash}:`, error);
      }
    }
  } catch (blockError) {
    console.error(`Error processing block ${block.number}:`, blockError);
  }
});
