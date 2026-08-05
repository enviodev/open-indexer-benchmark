import { createEffect, indexer, S } from "envio";

/**
 * The endpoint the benchmark points every indexer at. It answers
 * `allowance(owner, spender)` and nothing else.
 */
const RPC_URL = process.env.ENVIO_RPC_URL;
if (!RPC_URL) throw new Error("ENVIO_RPC_URL must be set");

/** `allowance(address,address)` */
const SELECTOR = "0xdd62ed3e";

const word = (address: string) => address.slice(2).toLowerCase().padStart(64, "0");

/**
 * Reading the allowance is an external call, so it goes through the Effect API
 * rather than being an ordinary `fetch` in the handler.
 *
 * That is what makes the case survivable. Handlers run twice — once across the
 * whole batch in preload, where nothing is written and every effect in the
 * batch is in flight at the same time, and once in block order, where the
 * results are already in hand. A `fetch` written inline would run in both
 * passes and, in the second, one call at a time.
 *
 * Identical inputs are deduplicated, so an owner who approves the same spender
 * twice in one block is one call rather than two. `rateLimit: false` because
 * the endpoint's own concurrency ceiling is the limit the case is about;
 * against a real provider this is where its rate limit would go.
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
  async ({ input }) => {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [
          {
            to: input.token,
            data: `${SELECTOR}${word(input.owner)}${word(input.spender)}`,
          },
          // Read at the block the approval was in, not at the head: the
          // allowance is a value at a point in the chain's history.
          `0x${input.blockNumber.toString(16)}`,
        ],
      }),
    });
    const body = (await response.json()) as { result?: string; error?: { message: string } };
    if (body.error) throw new Error(`allowance call failed: ${body.error.message}`);
    return BigInt(body.result!);
  }
);

indexer.onEvent(
  { contract: "ERC20", event: "Approval" },
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
