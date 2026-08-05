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
// latency, same concurrency ceiling, same answers, run after run. What is left
// to measure is the only thing that differs — how well an indexer overlaps
// calls it cannot avoid making.
//
// The answers are derived from the arguments rather than fetched, which also
// means they cannot be guessed: a checksum only matches if the indexer really
// made the call, at the right block, and stored what came back.

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
   */
  latencyMs: number;
  /**
   * How many intercepted calls are served at once. Beyond this they queue, the
   * way a provider's per-key concurrency limit makes them queue.
   *
   * Without a ceiling the case would measure how large a batch each tool
   * happens to hand its handlers — fire ten thousand calls at once and they all
   * come back in `latencyMs`. With one, every tool is up against the same wall
   * and the measurement is how close it gets to it.
   */
  maxConcurrent: number;
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
  /** Highest number of intercepted calls in flight at once. */
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

/**
 * The call an `eth_call` describes, or null when it is not one this endpoint
 * can serve deterministically.
 *
 * A block tag of "latest" is refused rather than resolved. The answers are a
 * function of the block, so a tool reading at the head instead of at the
 * event's block would record different values for the same events every run;
 * failing the call says so immediately, where quietly answering it would
 * surface hours later as an unexplained checksum mismatch.
 */
function decodeCall(params: unknown[] | undefined): EthCall | string {
  const [tx, blockTag] = (params ?? []) as [
    { to?: string; data?: string; input?: string } | undefined,
    string | undefined,
  ];
  if (!tx?.to) return "eth_call without a `to` address";
  const data = (tx.data ?? tx.input ?? "0x").toLowerCase();
  if (typeof blockTag !== "string" || !blockTag.startsWith("0x")) {
    return `eth_call at block tag "${blockTag}" — this case's calls must name the block they read at`;
  }
  const block = Number(BigInt(blockTag));
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

  // The concurrency ceiling. Waiters are resolved in arrival order, so a tool
  // that queues a thousand calls is not starved by one that keeps adding more.
  const waiting: (() => void)[] = [];
  function acquire(): Promise<void> {
    if (inFlight < interceptor.maxConcurrent) {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  }
  function release() {
    const next = waiting.shift();
    if (next) {
      // The slot is handed straight to the next waiter; `inFlight` never drops.
      peakInFlight = Math.max(peakInFlight, inFlight);
      next();
    } else {
      inFlight--;
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Answer one intercepted call, after its wait. */
  async function serve(req: RpcRequest): Promise<object> {
    const call = decodeCall(req.params);
    if (typeof call === "string") {
      rejected++;
      return rpcError(req.id, -32_602, call);
    }
    await acquire();
    try {
      await sleep(interceptor.latencyMs);
      const result = interceptor.answer(call);
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
      release();
    }
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
