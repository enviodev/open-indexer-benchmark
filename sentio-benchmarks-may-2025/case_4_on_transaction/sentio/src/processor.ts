import { EthChainId, GlobalContext, GlobalProcessor } from '@sentio/sdk/eth'
import { getPriceByType, token } from '@sentio/sdk/utils'
import { BigDecimal, scaleDown } from '@sentio/sdk'
import { GasSpent } from './schema/schema.js'

GlobalProcessor.bind({ startBlock: 22280000, endBlock: 22290000 }).onTransaction(
  async (tx, ctx) => {
    // Only process transactions with a valid receipt
    if (!ctx.transactionReceipt || !ctx.transaction) {
      return
    }
    
    // Use the tx parameter directly where possible
    const from = tx.from.toLowerCase()
    const to = (tx.to || '0x0').toLowerCase()
    
    // Get gas parameters
    const gasUsed = BigInt(ctx.transactionReceipt.gasUsed)
    const effectiveGasPrice = ctx.transactionReceipt.effectiveGasPrice ? BigInt(ctx.transactionReceipt.effectiveGasPrice) : undefined
    const gasPrice = BigInt(ctx.transactionReceipt.gasPrice || 0n)
    const priceForCalculation = effectiveGasPrice !== undefined ? effectiveGasPrice : gasPrice
    const gasValue = gasUsed * priceForCalculation
    const blockNumber = BigInt(tx.blockNumber || 0)
    
    // Debug logging for the first few transactions or when block number is a multiple of 10000
    if (blockNumber <= 22280005n || blockNumber % 10000n === 0n) {
      console.log(`Gas Calculation Details for tx ${tx.hash} at block ${blockNumber}:`);
      console.log(`- gasUsed: ${gasUsed.toString()}`);
      console.log(`- gasPrice: ${gasPrice.toString()}`);
      console.log(`- effectiveGasPrice: ${effectiveGasPrice !== undefined ? effectiveGasPrice.toString() : 'N/A'}`);
      console.log(`- gasValue (gasUsed * price): ${gasValue.toString()}`);
    }

    // Create a unique ID for this transaction - use tx.hash directly
    const txHash = tx.hash.toLowerCase()
    
    // Store the gas spent record in the database with optimized buffer conversion
    const gasSpent = new GasSpent({
      id: txHash,
      from: from,
      to: to,
      gasValue: gasValue,
      gasUsed: gasUsed,
      gasPrice: gasPrice,
      effectiveGasPrice: effectiveGasPrice,
      blockNumber: blockNumber,
      transactionHash: Buffer.from(txHash.slice(2), 'hex')
    })
    
    // Use store.upsert efficiently
    await ctx.store.upsert(gasSpent)
  },
  { transaction: true, transactionReceipt: true }
)

