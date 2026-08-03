// Minimal HyperSync client used to build the ground-truth data that indexer
// output is verified against. Deliberately dependency-free: the benchmark has
// no root package.json and every script runs straight through `node`.

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

const HYPERSYNC_URL = "https://eth.hypersync.xyz/query";

/** `ProxyCreation(address proxy, address singleton)` — Safe proxy factory. */
export const PROXY_CREATION_TOPIC =
  "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235";
/**
 * `SafeSetup(address indexed initiator, address[] owners, uint256 threshold,
 * address initializer, address fallbackHandler)` — emitted by the proxy itself.
 */
export const SAFE_SETUP_TOPIC =
  "0x141df868a6331af528e38c83b7aa03edc19be66e37ae67f9285bf4f8e3c6a1a8";
/** `SafeReceived(address indexed sender, uint256 value)` — bare ETH inbound. */
export const SAFE_RECEIVED_TOPIC =
  "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d";
/**
 * `SafeModuleTransaction(address module, address to, uint256 value, bytes
 * data, uint8 operation)` — emitted by the L2 singleton on a module call.
 */
export const SAFE_MODULE_TRANSACTION_TOPIC =
  "0xb648d3644f584ed1c2232d53c46d87e693586486ad0d1175f8656013110b714e";

export interface DecodedLog {
  blockNumber: number;
  logIndex: number;
  /** Unix seconds of the containing block. */
  timestamp: number;
  /** Lowercase address of the contract that emitted the log. */
  address: string;
  topic0: string;
  /** First indexed argument as a lowercase address (`from` / `owner`). */
  arg0: string;
  /** Second indexed argument as a lowercase address (`to` / `spender`). */
  arg1: string;
  /** The non-indexed `value` argument. */
  value: bigint;
  /** Raw `data` payload, for cases that need a word other than the first. */
  data: string;
}

/**
 * The n-th 32-byte word of a log's data payload, as a lowercase address.
 * Reading a specific word is the only way to get at arguments past the first
 * for events whose payload holds several — `SafeSetup`, for instance.
 */
export function addressAtWord(data: string, index: number): string {
  return `0x${wordHex(data, index).slice(24)}`;
}

/** The n-th 32-byte word of a log's data payload, as a bigint. */
export function uintAtWord(data: string, index: number): bigint {
  const hex = wordHex(data, index);
  return hex ? BigInt(`0x${hex}`) : BigInt(0);
}

function wordHex(data: string, index: number): string {
  const body = (data.startsWith("0x") ? data.slice(2) : data).toLowerCase();
  const start = index * 64;
  return body.length >= start + 64 ? body.slice(start, start + 64) : "";
}

const MAX_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST with retries. Transient DNS failures and 5xx responses are common
 * enough that without this a whole benchmark job can fail before it starts.
 */
async function post(url: string, token: string, body?: unknown): Promise<any> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return await res.json();
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
      // Anything other than a server-side or rate-limit response is a request
      // the caller got wrong; retrying it just delays the error.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err: any) {
      lastError = String(err.message ?? err);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(attempt * 2_000);
  }
  throw new Error(`HyperSync request failed after ${MAX_ATTEMPTS} attempts — ${lastError}`);
}

/**
 * `0x…32 bytes` topic → lowercase 20-byte address. Absent topics read as the
 * zero address: an event with fewer indexed arguments than another is normal,
 * and the case logic decides which of `arg0`/`arg1` it actually looks at.
 */
function topicToAddress(topic: string | undefined | null): string {
  if (!topic) return `0x${"0".repeat(40)}`;
  return `0x${topic.slice(-40).toLowerCase()}`;
}

/** First 32-byte word of a log's data payload as a bigint. */
function firstWord(data: string): bigint {
  const body = data.startsWith("0x") ? data.slice(2) : data;
  if (body.length < 64) return BigInt(0);
  return BigInt(`0x${body.slice(0, 64)}`);
}

/**
 * Fetch and decode every matching log in `[fromBlock, toBlock]` (both
 * inclusive). HyperSync paginates via `next_block`; its `to_block` is
 * exclusive, and block timestamps come back as hex strings.
 */
export async function fetchLogs(opts: {
  token: string;
  /**
   * Contract(s) to read logs from. Omit entirely to match on topics alone,
   * which is how the child half of a factory case is collected: its contracts
   * are not known until the factory logs have been read.
   */
  address?: string | string[];
  topics: string[];
  fromBlock: number;
  /** Inclusive. */
  toBlock: number;
  onProgress?: (block: number, logs: number) => void;
}): Promise<DecodedLog[]> {
  const { token, address, topics, fromBlock, toBlock } = opts;
  const addresses =
    address === undefined
      ? undefined
      : (Array.isArray(address) ? address : [address]).map((a) => a.toLowerCase());
  const out: DecodedLog[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const body = {
      from_block: cursor,
      to_block: toBlock + 1,
      logs: [{ ...(addresses ? { address: addresses } : {}), topics: [topics] }],
      field_selection: {
        log: [
          "address",
          "block_number",
          "log_index",
          "topic0",
          "topic1",
          "topic2",
          "data",
        ],
        block: ["number", "timestamp"],
      },
    };

    const json = await post(HYPERSYNC_URL, token, body);

    const timestamps = new Map<number, number>();
    for (const batch of json.data ?? []) {
      for (const block of batch.blocks ?? []) {
        timestamps.set(Number(block.number), Number(BigInt(block.timestamp)));
      }
    }

    for (const batch of json.data ?? []) {
      for (const log of batch.logs ?? []) {
        const blockNumber = Number(log.block_number);
        const timestamp = timestamps.get(blockNumber);
        if (timestamp === undefined) {
          throw new Error(`No block timestamp returned for block ${blockNumber}`);
        }
        out.push({
          blockNumber,
          logIndex: Number(log.log_index),
          timestamp,
          address: String(log.address).toLowerCase(),
          topic0: log.topic0.toLowerCase(),
          arg0: topicToAddress(log.topic1),
          arg1: topicToAddress(log.topic2),
          value: firstWord(log.data),
          data: String(log.data ?? "0x"),
        });
      }
    }

    const next = Number(json.next_block ?? 0);
    if (!next || next <= cursor) {
      // HyperSync stops advancing once the requested range is exhausted.
      break;
    }
    cursor = next;
    opts.onProgress?.(Math.min(cursor - 1, toBlock), out.length);
  }

  // Logs arrive block-ordered per batch, but sort explicitly so any caller that
  // depends on ordering (event id construction) is not at the mercy of paging.
  out.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber - b.blockNumber
  );
  return out;
}

/**
 * Ground truth for a factory case, in two passes: read the factory's own logs,
 * derive the child contracts they announce, then read the children's logs.
 *
 * The second pass filters on topics alone and discards non-children locally,
 * rather than asking HyperSync to match against the child address set. A
 * factory case registers children by the hundred thousand, and an address
 * filter that large is both slower to serve and awkward to page; the child
 * event is rare enough chain-wide that fetching all of it and rejecting the
 * strangers costs less than either.
 *
 * The result is one merged, block-and-log-index ordered stream, so case logic
 * sees events in exactly the order an indexer would.
 */
export async function fetchFactoryLogs(opts: {
  token: string;
  /**
   * The factory address, or several when a protocol has more than one
   * deployment. They are read in a single pass: what distinguishes them is how
   * each announces its child, which is `childOf`'s problem, not the query's.
   */
  factory: string | string[];
  factoryTopics: string[];
  childTopics: string[];
  /** Child contract announced by a factory log, lowercase. */
  childOf: (log: DecodedLog) => string;
  fromBlock: number;
  /** Inclusive. */
  toBlock: number;
  onProgress?: (block: number, logs: number) => void;
}): Promise<DecodedLog[]> {
  const factoryLogs = await fetchLogs({
    token: opts.token,
    address: opts.factory,
    topics: opts.factoryTopics,
    fromBlock: opts.fromBlock,
    toBlock: opts.toBlock,
    onProgress: opts.onProgress,
  });

  const children = new Set(factoryLogs.map((log) => opts.childOf(log).toLowerCase()));

  const childLogs = (
    await fetchLogs({
      token: opts.token,
      topics: opts.childTopics,
      fromBlock: opts.fromBlock,
      toBlock: opts.toBlock,
      onProgress: opts.onProgress,
    })
  ).filter((log) => children.has(log.address));

  return [...factoryLogs, ...childLogs].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber - b.blockNumber
  );
}

/** Current chain height as seen by HyperSync. */
export async function fetchChainHeight(token: string): Promise<number> {
  const json = await post("https://eth.hypersync.xyz/height", token);
  return Number(json.height);
}
