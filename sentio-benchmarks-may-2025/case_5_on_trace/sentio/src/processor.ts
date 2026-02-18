import { EthChainId } from "@sentio/sdk/eth";
import { Swap } from "./schema/schema.js";
import { Interface } from "ethers";
import { 
  UniswapV2Router02Context,
  UniswapV2Router02Processor,
  SwapExactTokensForTokensCallTrace 
} from "./types/eth/uniswapv2router02.js";

/**
 * Processes traces to identify and extract Uniswap V2 swaps
 */
const processor = UniswapV2Router02Processor.bind({
  address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  network: EthChainId.ETHEREUM,
  startBlock: 22200000, 
  endBlock: 22290000
});

/**
 * Handle swapExactTokensForTokens calls
 * Now using trace address in the ID for consistent identification across platforms
 */
processor.onCallSwapExactTokensForTokens(
  async (call: SwapExactTokensForTokensCallTrace, 
        ctx: UniswapV2Router02Context) => {
  // Extract swap parameters from the call arguments
  const { amountIn, amountOutMin, path, to, deadline } = call.args;
  
  // Skip if the path doesn't have at least 2 tokens (in and out)
  if (!path || path.length < 2) {
    return;
  }

  // Create a unique ID for this swap using transaction hash and trace address
  // This ensures consistent IDs across platforms
  const id = `${ctx.transactionHash || ""}-${ctx.trace?.traceAddress?.join("-") || "0"}`;
  
  // Create normalized path (addresses in lowercase) and convert to comma-separated string
  const normalizedPath = path.map((addr) => addr.toLowerCase());
  const pathStr = normalizedPath.join(',');
  const pathLength = normalizedPath.length;
  
  // Get transaction sender (from) and recipient (to)
  const fromAddress = ctx.transaction?.from;
  const toAddress = to.toLowerCase();
  
  // Get transaction hash
  const txHash = ctx.transaction?.hash;

  // Create swap entity
  const swap = new Swap({
    id: id,
    blockNumber: BigInt(ctx.blockNumber || 0),
    transactionHash: txHash || "",
    from: fromAddress || "",
    to: toAddress,
    amountIn: amountIn,
    amountOutMin: amountOutMin,
    deadline: deadline,
    path: pathStr,
    pathLength: pathLength
  });
  
  // Store the swap entity
  await ctx.store.upsert(swap);
  
  // Track metrics
  ctx.meter.Counter("swaps").add(1);
  
  // Log the swap information
  console.log(`Recorded swap: ${id}`);
  console.log(`  From: ${fromAddress}`);
  console.log(`  To: ${toAddress}`);
  console.log(`  Path: ${pathStr}`);
  console.log(`  Path Length: ${pathLength}`);
  console.log(`  Amount In: ${amountIn.toString()}`);
  console.log(`  Block: ${ctx.blockNumber}`);
  console.log(`  Trace Address: ${ctx.trace?.traceAddress?.join("-") || "0"}`);
  },
  {
    transaction: true,
    transactionReceipt: false,
    transactionReceiptLogs: false,
    trace: true, // Make sure we request trace information
  },
);