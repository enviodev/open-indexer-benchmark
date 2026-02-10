import { ethereum, store, log, Address, BigInt, Bytes, TypedMap } from "@graphprotocol/graph-ts";
import { Swap } from "../generated/schema";
import { SwapExactTokensForTokensCall } from "../generated/case_5_on_trace/UniswapV2Router02";

// Create a map to store transaction counters in memory
let txCounters = new TypedMap<string, BigInt>();

export function handleSwapExactTokensForTokens(
  call: SwapExactTokensForTokensCall
): void {
  // Create unique ID for this swap using transaction hash and counter
  let txHash = call.transaction.hash.toHexString();
  
  // Get current counter for this transaction
  let count = BigInt.fromI32(0);
  if (txCounters.isSet(txHash)) {
    let storedCount = txCounters.get(txHash);
    if (storedCount) {
      count = storedCount;
    }
  }
  
  // Increment the counter
  count = count.plus(BigInt.fromI32(1));
  txCounters.set(txHash, count);
  
  // Use the counter value as the trace identifier
  let traceAddressPath = count.toString();
  
  // Create the ID in the standardized format
  let swapId = `${txHash}-${traceAddressPath}`;

  // Create new entity
  let swap = new Swap(swapId);
  
  // Set standard fields
  swap.blockNumber = call.block.number;
  swap.transactionHash = call.transaction.hash.toHexString();
  
  // FIXED: Use transaction.from to get the actual sender (EOA) 
  // that initiated the transaction, not the immediate caller
  swap.from = call.transaction.from.toHexString().toLowerCase();
  
  // Set to address (recipient)
  swap.to = call.inputs.to.toHexString().toLowerCase();
  
  // Extract parameters directly from the call
  swap.amountIn = call.inputs.amountIn;
  swap.amountOutMin = call.inputs.amountOutMin;
  swap.deadline = call.inputs.deadline;
  
  // Extract path addresses and convert to comma-separated string
  let pathAddresses: string[] = [];
  for (let i = 0; i < call.inputs.path.length; i++) {
    pathAddresses.push(call.inputs.path[i].toHexString().toLowerCase());
  }
  
  // Store path as comma-separated string
  swap.path = pathAddresses.join(',');
  
  // Store path length
  swap.pathLength = call.inputs.path.length;

  // Save the entity
  swap.save();
  
  log.info("Processed swap tx: {} with sequence number {}, sender: {}", [
    txHash, 
    traceAddressPath,
    call.transaction.from.toHexString()
  ]);
} 