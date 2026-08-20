/**
 * The one thing the harness has to know about running an indexer in a
 * container: how the host looks from inside one.
 *
 * This lives apart from rpc-mock.ts, where it started, because of what depends
 * on it. The endpoint that answers contract calls belongs to one scenario, and
 * CI narrows a change to it down to that scenario. This does not: the SubQuery
 * driver applies it to every URL in every scenario, so a change here has to run
 * all of them, and leaving it next to the endpoint made the narrowing a lie.
 */

/**
 * A URL as seen from inside a container.
 *
 * Most drivers run the indexer natively and can use the URL as it is. The one
 * that runs it in Docker cannot: loopback there is the container's own. Docker
 * maps `host.docker.internal` to the host when the service declares
 * `host-gateway`, which this case's compose file does.
 *
 * A URL that is not local is returned untouched, so this is safe to apply
 * unconditionally: every case but the contract-call one hands the drivers a
 * public endpoint.
 */
export function containerUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") return url;
  parsed.hostname = "host.docker.internal";
  return parsed.toString();
}
