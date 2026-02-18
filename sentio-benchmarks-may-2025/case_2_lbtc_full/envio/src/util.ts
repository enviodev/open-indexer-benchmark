import { createPublicClient, http, parseAbi, getContract } from "viem";
import { experimental_createEffect, S } from "envio";
import { mainnet } from "viem/chains";
import { BigDecimal } from "generated";

// Define the ABI for the ERC20 balanceOf function
const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

// Get RPC URL from environment variable
const rpcUrl = process.env.ENVIO_RPC_URL;
if (!rpcUrl) {
  throw new Error("ENVIO_RPC_URL environment variable is required");
}

// Create a public client to interact with the blockchain
const client = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl, {
    batch: {
      batchSize: 100,
    },
  }),
});

// Get the contract instance for LBTC
const lbtcContract = getContract({
  abi: erc20Abi,
  address: "0x8236a87084f8B84306f72007F36F2618A5634494",
  client: client,
});

// Function to get the balance of a specific address at a specific block
export const getBalance = experimental_createEffect(
  {
    name: "getBalance",
    input: {
      address: S.string,
      blockNumber: S.optional(S.bigint),
    },
    output: S.bigDecimal,
  },
  async ({ input, context }) => {
    try {
      // If blockNumber is provided, use it to get balance at that specific block
      const options = input.blockNumber
        ? { blockNumber: input.blockNumber }
        : undefined;
      const balance = await lbtcContract.read.balanceOf(
        [input.address as `0x${string}`],
        options
      );
      return BigDecimal(balance.toString());
    } catch (error) {
      context.log.error(
        `Error getting balance for ${input.address}`,
        error as Error
      );
      // Return 0 on error to prevent processing failures
      return BigDecimal(0);
    }
  }
);
