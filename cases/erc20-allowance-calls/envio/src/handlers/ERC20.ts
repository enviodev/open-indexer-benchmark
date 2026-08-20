import { createEffect, indexer, S } from "envio";
import { createPublicClient, http, parseAbi } from "viem";

/**
 * The endpoint the benchmark points every indexer at. It answers
 * `allowance(owner, spender)` and nothing else.
 */
const RPC_URL = process.env.ENVIO_RPC_URL;
if (!RPC_URL) throw new Error("ENVIO_RPC_URL must be set");

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
]);

/**
 * The client the effect makes its calls through.
 *
 * `batch` is what matters here. The Effect API hands the whole batch's calls
 * over at once — several thousand of them — and a client that sends each as its
 * own HTTP request opens a socket per call, which costs about a millisecond
 * each and swamps the round trip the calls are actually waiting on: 14,114
 * calls that way take 17.6s against an endpoint that answers each in 200ms.
 * With batching, viem collects the calls made in the same tick into one
 * JSON-RPC request, and the same work is a couple of dozen requests instead of
 * fourteen thousand.
 *
 * This is not the same thing as a `multicall` aggregate, which the endpoint
 * refuses: every allowance read is still its own `eth_call`, made at its own
 * block, and the endpoint holds and counts each one separately. All that
 * changes is how many HTTP requests carry them.
 */
const client = createPublicClient({
  transport: http(RPC_URL, {
    batch: { batchSize: 1_000, wait: 0 },
  }),
});

/**
 * Reading the allowance is an external call, so it goes through the Effect API
 * rather than being an ordinary call in the handler.
 *
 * That is what makes the case survivable. Handlers run twice — once across the
 * whole batch in preload, where nothing is written and every effect in the
 * batch is in flight at the same time, and once in block order, where the
 * results are already in hand. A call written inline would run in both passes
 * and, in the second, one at a time.
 *
 * Identical inputs are deduplicated, so an owner who approves the same spender
 * twice in one block is one call rather than two. `rateLimit: false` because
 * the endpoint imposes none either; against a real provider that option is
 * where its limit would go.
 */
const getAllowance = createEffect(
  {
    name: "getAllowance",
    input: {
      token: S.address,
      owner: S.address,
      spender: S.address,
      blockNumber: S.int32,
    },
    output: S.bigint,
    rateLimit: false,
  },
  ({ input }) =>
    client.readContract({
      abi: erc20Abi,
      address: input.token,
      functionName: "allowance",
      args: [input.owner, input.spender],
      // Read at the block the approval was in, not at the head: the allowance
      // is a value at a point in the chain's history.
      blockNumber: BigInt(input.blockNumber),
    })
);

indexer.onEvent(
  { contract: "ERC20", event: "Approval", fields: { block: ["timestamp"] } },
  async ({ event, context }) => {
    const approved = event.params.value;

    // An approval of zero revokes it, and a revoked allowance is zero whatever
    // the token reports — so there is nothing to go and ask. Roughly a fifth of
    // the approvals in this range are revocations.
    const allowance =
      approved === 0n
        ? 0n
        : await context.effect(getAllowance, {
            token: event.srcAddress,
            owner: event.params.owner,
            spender: event.params.spender,
            blockNumber: event.block.number,
          });

    context.ApprovalEvent.set({
      id: `${event.block.number}-${event.logIndex}`,
      token: event.srcAddress,
      owner: event.params.owner,
      spender: event.params.spender,
      approved,
      allowance,
      timestamp: event.block.timestamp,
    });

    context.TokenAllowance.set({
      id: `${event.srcAddress}-${event.params.owner}-${event.params.spender}`,
      token: event.srcAddress,
      owner: event.params.owner,
      spender: event.params.spender,
      allowance,
    });
  }
);
