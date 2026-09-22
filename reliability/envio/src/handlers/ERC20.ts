import { indexer } from "envio";
import { createPublicClient, http, parseAbi } from "viem";

const RPC_URL = process.env.ENVIO_RPC_URL;
if (!RPC_URL) throw new Error("ENVIO_RPC_URL must be set");

const TOKEN = "0x0000000000000000000000000000000000c0ffee" as const;

/** The byte Postgres will not accept in a text column. */
const NUL = String.fromCharCode(0);

const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

const client = createPublicClient({ transport: http(RPC_URL) });

/**
 * The token's metadata, read once for the whole run.
 *
 * Handlers run twice - once in preload and once in order - so an unguarded
 * call here would be two calls per transfer rather than one per indexer. The
 * promise is the cache: whoever gets there first makes the call and everyone
 * else awaits the same answer.
 *
 * Both reads are expected to answer awkwardly. `symbol()` returns no data at
 * all, which is what a token that does not implement it does, and has to be
 * stored as a null rather than crash the handler. The name carries a NUL byte,
 * legal in a Solidity string and not storable in a text column, so it is
 * stripped rather than written through.
 */
let metadata: Promise<{ symbol: string | null; name: string | null }> | null = null;

function readMetadata() {
  metadata ??= (async () => {
    const read = async (functionName: "symbol" | "name") => {
      try {
        const value = await client.readContract({
          abi: erc20Abi,
          address: TOKEN,
          functionName,
        });
        if (typeof value !== "string" || value.length === 0) return null;
        const cleaned = value.split(NUL).join("");
        return cleaned.length > 0 ? cleaned : null;
      } catch {
        // A revert, or returndata that does not decode as a string, is the
        // token not answering - which is a null, not a failed block.
        return null;
      }
    };
    return { symbol: await read("symbol"), name: await read("name") };
  })();
  return metadata;
}

indexer.onEvent(
  { contract: "ERC20", event: "Transfer" },
  async ({ event, context }) => {
    const { from, to, value } = event.params;

    const token = await context.Token.get(TOKEN);
    if (!token) {
      const { symbol, name } = await readMetadata();
      context.Token.set({ id: TOKEN, symbol, name });
    }

    const [sender, receiver] = await Promise.all([
      context.Account.getOrCreate({ id: from, balance: 0n }),
      context.Account.getOrCreate({ id: to, balance: 0n }),
    ]);

    // Sending to yourself leaves the balance unchanged. Both reads observed the
    // same pre-transfer balance, so applying the debit and the credit as two
    // writes would keep only the credit.
    if (from !== to) {
      context.Account.set({ ...sender, balance: sender.balance - value });
      context.Account.set({ ...receiver, balance: receiver.balance + value });
    }

    context.Transfer.set({
      id: `${event.block.number}-${event.logIndex}`,
      blockNumber: BigInt(event.block.number),
      logIndex: BigInt(event.logIndex),
      from,
      to,
      amount: value,
    });
  }
);

/** The other event the chain emits, stored as it arrives. */
indexer.onEvent(
  { contract: "ERC20", event: "MetadataUpdated" },
  async ({ event, context }) => {
    const clean = (value: string) => value.split(NUL).join("") || null;
    context.MetadataUpdate.set({
      id: `${event.block.number}-${event.logIndex}`,
      blockNumber: BigInt(event.block.number),
      logIndex: BigInt(event.logIndex),
      symbol: clean(event.params.symbol),
      name: clean(event.params.name),
    });
  }
);
