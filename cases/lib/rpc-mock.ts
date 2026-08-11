// A JSON-RPC endpoint that answers a case's contract calls itself, and passes
// everything else through to the real one.
//
// A case that reads contract state has to get those reads from somewhere, and
// neither of the obvious sources works for a benchmark. A real archive node
// answers an `eth_call` in anywhere from a few milliseconds to a few hundred,
// depending on the node, the call and how busy it is, so the same run measured
// twice would not produce the same number — and the shared endpoint the rest of
// the benchmark reads from (HyperRPC) does not serve `eth_call` at all.
//
// So the benchmark serves them. Every intercepted call is held for a fixed
// delay and answered from the call's own arguments, which makes the external
// dependency the one thing in the case that is identical for every tool: same
// latency, same answers, no limit on how many it will take at once, run after
// run. What is left to measure is the only thing that differs — how well an
// indexer overlaps calls it cannot avoid making.
//
// The answers are derived from the arguments rather than fetched, which also
// means they cannot be guessed: a checksum only matches if the indexer really
// made the call, at the right block, and stored what came back.
//
// Nothing here rate limits or queues. Ten thousand calls arriving at once are
// ten thousand calls in flight, all answered `latencyMs` later, so the only
// thing deciding how many an indexer has outstanding is the indexer. The
// practical ceiling is the process's open-file limit, since a call in flight is
// a socket: on a machine with the usual 1024, raise it (`ulimit -n`) before
// concluding that a tool stopped scaling on its own.

import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { Agent } from "node:https";
import { Agent as HttpAgent } from "node:http";

/** One decoded `eth_call` the case may want to answer. */
export interface EthCall {
  /** Callee, lowercase. */
  to: string;
  /** Calldata, lowercase, `0x`-prefixed. */
  data: string;
  /** Block the call is made against. */
  block: number;
}

export interface EthCallInterceptor {
  /**
   * How long every intercepted call is held before it is answered. The point
   * of the case is what an indexer does while it waits, so this is the one
   * number the whole scenario is calibrated around.
   *
   * It is also the only limit. The endpoint answers as many calls at once as
   * it is given — no rate limit, no concurrency ceiling — so nothing outside
   * the indexer decides how many it may have outstanding, and the peak in
   * flight is a measurement of the tool rather than of a cap it ran into.
   */
  latencyMs: number;
  /**
   * The 32-byte hex answer for a call the case defines, or null for one it
   * does not. A null is returned to the indexer as a JSON-RPC error rather
   * than passed upstream: the case's own contract reads are the only calls it
   * expects to see, and a tool making a different one (a `multicall`
   * aggregate, a token metadata read) is doing something the other tools are
   * not, which should surface as a failure rather than as a faster row.
   */
  answer(call: EthCall): string | null;
}

export interface RpcMockStats {
  /** Intercepted calls answered. */
  calls: number;
  /** Intercepted calls rejected because the case does not define them. */
  rejected: number;
  /**
   * Highest number of intercepted calls in flight at once. Since nothing here
   * limits that, it is how many the indexer chose to have outstanding — the
   * number that explains its rate.
   */
  peakInFlight: number;
  /** Requests forwarded upstream, contract calls aside. */
  upstream: number;
}

export interface RpcMock {
  /** What the indexers are pointed at. */
  url: string;
  stats(): RpcMockStats;
  /** Zero the counters, so each phase reports its own. */
  reset(): void;
  close(): Promise<void>;
}

/** Port the intercepting endpoint listens on. */
const MOCK_PORT = 19_878;

/**
 * The same endpoint, as seen from inside a container.
 *
 * Most drivers run the indexer natively and can use the URL as it is. The one
 * that runs it in Docker cannot: loopback there is the container's own. Docker
 * maps `host.docker.internal` to the host when the service declares
 * `host-gateway`, which this case's compose file does.
 *
 * A URL that is not local is returned untouched, so this is safe to apply
 * unconditionally: every case but this one hands the drivers a public endpoint.
 */
export function containerUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return url;
  parsed.hostname = "host.docker.internal";
  return parsed.toString();
}

const JSON_HEADERS = { "content-type": "application/json" };

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** A single JSON-RPC call, as it arrives. */
interface RpcRequest {
  id?: unknown;
  method?: string;
  params?: unknown[];
}

/** How a call named its block, before the block number is known. */
type BlockRef = { number: number } | { hash: string };

/**
 * The block an `eth_call` is made against.
 *
 * Three spellings are in use among the tools here: a hex block number, and
 * both EIP-1898 forms — `{blockNumber}` and `{blockHash}`. Graph Node uses the
 * hash form, so refusing it would refuse every call a subgraph makes.
 *
 * A tag of "latest" is refused rather than resolved. The answers are a function
 * of the block, so a tool reading at the head instead of at the event's block
 * would record different values for the same events every run; failing the call
 * says so immediately, where quietly answering it would surface hours later as
 * an unexplained checksum mismatch.
 */
function decodeBlockRef(blockTag: unknown): BlockRef | string {
  if (typeof blockTag === "string") {
    if (!blockTag.startsWith("0x")) {
      return `eth_call at block tag "${blockTag}" — this case's calls must name the block they read at`;
    }
    return { number: Number(BigInt(blockTag)) };
  }
  if (blockTag && typeof blockTag === "object") {
    const ref = blockTag as { blockNumber?: string; blockHash?: string };
    if (typeof ref.blockNumber === "string" && ref.blockNumber.startsWith("0x")) {
      return { number: Number(BigInt(ref.blockNumber)) };
    }
    if (typeof ref.blockHash === "string" && ref.blockHash.startsWith("0x")) {
      return { hash: ref.blockHash.toLowerCase() };
    }
  }
  return (
    `eth_call at block tag "${JSON.stringify(blockTag)}" — this case's calls ` +
    `must name the block they read at`
  );
}

/**
 * The call an `eth_call` describes, or the reason it cannot be served.
 */
function decodeCall(
  params: unknown[] | undefined
): { to: string; data: string; block: BlockRef } | string {
  const [tx, blockTag] = (params ?? []) as [
    { to?: string; data?: string; input?: string } | undefined,
    unknown,
  ];
  if (!tx?.to) return "eth_call without a `to` address";
  const data = (tx.data ?? tx.input ?? "0x").toLowerCase();
  const block = decodeBlockRef(blockTag);
  if (typeof block === "string") return block;
  return { to: tx.to.toLowerCase(), data, block };
}

export async function startRpcMock(
  upstream: string,
  interceptor: EthCallInterceptor
): Promise<RpcMock> {
  const target = new URL(upstream);
  const secure = target.protocol === "https:";
  // Keep-alive on the upstream side: without it every forwarded request pays a
  // fresh TLS handshake, which would show up as the endpoint being slow rather
  // than as what it is — the benchmark's own plumbing.
  const agent = secure
    ? new Agent({ keepAlive: true, maxSockets: 256 })
    : new HttpAgent({ keepAlive: true, maxSockets: 256 });
  const forward = secure ? httpsRequest : httpRequest;

  let calls = 0;
  let rejected = 0;
  let upstreamRequests = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Answer one intercepted call, after its wait. */
  async function serve(req: RpcRequest): Promise<object> {
    const call = decodeCall(req.params);
    if (typeof call === "string") {
      rejected++;
      return rpcError(req.id, -32_602, call);
    }
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      // A call that named its block by hash needs the number before it can be
      // answered, since the answers are a function of the block. That lookup
      // runs alongside the wait rather than after it — cached, so it is one
      // upstream request per block whatever the tool's call volume — which
      // keeps the latency every tool sees identical to the tools that name the
      // number outright.
      const [, block] = await Promise.all([
        sleep(interceptor.latencyMs),
        "number" in call.block
          ? call.block.number
          : blockNumberOf(call.block.hash),
      ]);
      if (block === null) {
        rejected++;
        return rpcError(
          req.id,
          -32_602,
          `eth_call at an unknown block hash ${(call.block as { hash: string }).hash}`
        );
      }
      const result = interceptor.answer({ to: call.to, data: call.data, block });
      if (result === null) {
        rejected++;
        return rpcError(
          req.id,
          -32_601,
          `eth_call to ${call.to} with data ${call.data.slice(0, 10)} is not part of this case`
        );
      }
      calls++;
      return { jsonrpc: "2.0", id: req.id ?? null, result };
    } finally {
      inFlight--;
    }
  }

  /**
   * The number of the block with this hash, asked of the real endpoint once
   * and remembered. Null when it does not know it either.
   */
  const blockNumbers = new Map<string, Promise<number | null>>();
  function blockNumberOf(hash: string): Promise<number | null> {
    let pending = blockNumbers.get(hash);
    if (!pending) {
      pending = proxy(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBlockByHash",
          params: [hash, false],
        })
      )
        .then(({ body }) => {
          const number = JSON.parse(body)?.result?.number;
          return typeof number === "string" ? Number(BigInt(number)) : null;
        })
        .catch(() => null);
      // A failed lookup is not remembered as a failure: the next call for that
      // block asks again rather than inheriting one bad round trip.
      pending.then((value) => {
        if (value === null) blockNumbers.delete(hash);
      });
      blockNumbers.set(hash, pending);
    }
    return pending;
  }

  /** Send a body upstream and hand back the raw response. */
  function proxy(body: string): Promise<{ status: number; body: string }> {
    upstreamRequests++;
    return new Promise((resolve, reject) => {
      const req = forward(
        {
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || (secure ? 443 : 80),
          path: target.pathname + target.search,
          method: "POST",
          agent,
          headers: {
            ...JSON_HEADERS,
            "content-length": Buffer.byteLength(body),
          },
        },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 502,
              body: Buffer.concat(chunks).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      req.end(body);
    });
  }

  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405, JSON_HEADERS).end('{"error":"POST only"}');
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("error", () => res.destroy());
    req.on("end", async () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let payload: RpcRequest | RpcRequest[];
      try {
        payload = JSON.parse(raw);
      } catch {
        res.writeHead(400, JSON_HEADERS).end(JSON.stringify(rpcError(null, -32_700, "parse error")));
        return;
      }

      const batch = Array.isArray(payload) ? payload : [payload];
      const isCall = batch.map((entry) => entry?.method === "eth_call");

      try {
        // Nothing to intercept: hand the whole request over untouched. This is
        // the path every log, block and receipt read takes, so it stays a plain
        // relay — the case is about contract calls, and the rest of an
        // indexer's traffic should not be measuring this process.
        if (!isCall.some(Boolean)) {
          const relayed = await proxy(raw);
          res.writeHead(relayed.status, JSON_HEADERS).end(relayed.body);
          return;
        }

        // A batch can hold both. The calls are served here, the rest goes
        // upstream in one request, and the answers are put back in the order
        // they were asked for — a client matches on id, but not every client
        // sends distinct ones.
        const answers = new Array<object | undefined>(batch.length);
        const passthrough = batch.filter((_, i) => !isCall[i]);

        const relayed = passthrough.length
          ? proxy(JSON.stringify(passthrough)).then((response) => {
              const parsed = JSON.parse(response.body);
              const list: object[] = Array.isArray(parsed) ? parsed : [parsed];
              let next = 0;
              for (let i = 0; i < batch.length; i++) {
                if (!isCall[i]) answers[i] = list[next++];
              }
            })
          : Promise.resolve();

        await Promise.all([
          relayed,
          ...batch.map(async (entry, i) => {
            if (isCall[i]) answers[i] = await serve(entry);
          }),
        ]);

        const body = Array.isArray(payload) ? answers : answers[0];
        res.writeHead(200, JSON_HEADERS).end(JSON.stringify(body));
      } catch (err: any) {
        res
          .writeHead(502, JSON_HEADERS)
          .end(JSON.stringify(rpcError(null, -32_603, String(err?.message ?? err))));
      }
    });
  });

  // Indexers hold their connections open; the default 5s idle timeout would
  // have them reconnecting throughout a run.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;

  // Bound on every interface, not just loopback: one of the indexers runs
  // inside a container, and a loopback-only endpoint is not reachable from
  // there. See containerUrl().
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOCK_PORT, resolve);
  });

  return {
    url: `http://127.0.0.1:${MOCK_PORT}`,
    stats: () => ({ calls, rejected, peakInFlight, upstream: upstreamRequests }),
    reset() {
      calls = 0;
      rejected = 0;
      upstreamRequests = 0;
      peakInFlight = inFlight;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
