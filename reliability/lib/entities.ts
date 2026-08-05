// What every tool is asked to store, and what the mock chain says it should be.
//
// Two entities, both written straight from an event with nothing aggregated:
// reliability is about whether the right rows survive, so the handler logic is
// kept as thin as it can be. Anything a tool gets wrong here is the harness's
// doing — a crash, an outage, a reorg — rather than a difference of opinion
// about what the case meant.

import { psql } from "../../cases/lib/process.ts";
import { canonicalRow, type EntitySpec, type ResolvedEntity } from "./introspect.ts";
import type { MockBlock, MockChain, MockLog } from "./chain.ts";
import { METADATA_TOPIC, TRANSFER_TOPIC } from "./abi.ts";

export const TRANSFER_ENTITY: EntitySpec = {
  key: "transferEvent",
  label: "transfer events",
  tableCandidates: ["TransferEvent", "transfer_event", "transfer"],
  fields: [
    { role: "blockNumber", kind: "number", candidates: ["block_number", "blockNumber"] },
    { role: "logIndex", kind: "number", candidates: ["log_index", "logIndex"] },
    { role: "from", kind: "address", candidates: ["from", "from_address", "sender"] },
    { role: "to", kind: "address", candidates: ["to", "to_address", "receiver"] },
    { role: "value", kind: "amount", candidates: ["value", "amount"] },
    {
      role: "timestamp",
      kind: "seconds",
      candidates: ["timestamp", "block_timestamp", "blockTimestamp"],
    },
  ],
};

export const METADATA_ENTITY: EntitySpec = {
  key: "tokenMetadata",
  label: "metadata rows",
  tableCandidates: ["TokenMetadata", "token_metadata", "metadata_updated"],
  fields: [
    { role: "blockNumber", kind: "number", candidates: ["block_number", "blockNumber"] },
    { role: "logIndex", kind: "number", candidates: ["log_index", "logIndex"] },
    { role: "symbol", kind: "text", candidates: ["symbol"] },
    { role: "name", kind: "text", candidates: ["name"] },
  ],
};

export const ENTITIES = [TRANSFER_ENTITY, METADATA_ENTITY];

/** `0x…` address from a 32-byte topic word. */
const addressFromTopic = (topic: string): string =>
  `0x${topic.slice(-40)}`.toLowerCase();

/** One decoded string from the head-and-tail encoding of a `(string, string)`. */
function decodeStrings(data: string, count: number): string[] {
  const body = data.replace(/^0x/, "");
  const word = (index: number) => body.slice(index * 64, index * 64 + 64);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Number(BigInt(`0x${word(i)}`)) * 2;
    const length = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
    const bytes = body.slice(offset + 64, offset + 64 + length * 2);
    out.push(new TextDecoder().decode(Buffer.from(bytes, "hex")));
  }
  return out;
}

export interface ExpectedRows {
  transferEvent: string[];
  tokenMetadata: string[];
}

/** The rows a correct indexer holds once it has caught up with the chain as it stands. */
export function expectedRows(chain: MockChain, options: { upTo?: number } = {}): ExpectedRows {
  const upTo = options.upTo ?? chain.height;
  const transferEvent: string[] = [];
  const tokenMetadata: string[] = [];

  for (const { log, block } of chain.getLogs({ fromBlock: 0, toBlock: upTo })) {
    if (log.topics[0] === TRANSFER_TOPIC) {
      transferEvent.push(transferRow(log, block));
    } else if (log.topics[0] === METADATA_TOPIC) {
      const [symbol, name] = decodeStrings(log.data, 2);
      tokenMetadata.push(
        canonicalRow([String(block.number), String(log.logIndex), symbol, name])
      );
    }
  }
  return { transferEvent, tokenMetadata };
}

export function transferRow(log: MockLog, block: MockBlock): string {
  return canonicalRow([
    String(block.number),
    String(log.logIndex),
    addressFromTopic(log.topics[1]),
    addressFromTopic(log.topics[2]),
    BigInt(log.data).toString(),
    String(block.timestamp),
  ]);
}

export interface RowDiff {
  matched: number;
  /** On the canonical chain but not in the database. */
  missing: string[];
  /** In the database but not on the canonical chain — an orphan, or a duplicate. */
  unexpected: string[];
  /** Rows present more than once, which no tool should ever produce. */
  duplicated: string[];
}

export function diffRows(expected: string[], actual: string[]): RowDiff {
  const wanted = new Map<string, number>();
  for (const row of expected) wanted.set(row, (wanted.get(row) ?? 0) + 1);

  const seen = new Map<string, number>();
  for (const row of actual) seen.set(row, (seen.get(row) ?? 0) + 1);

  const missing: string[] = [];
  const unexpected: string[] = [];
  const duplicated: string[] = [];
  let matched = 0;

  for (const [row, count] of wanted) {
    const got = seen.get(row) ?? 0;
    matched += Math.min(count, got);
    for (let i = got; i < count; i++) missing.push(row);
    for (let i = count; i < got; i++) duplicated.push(row);
  }
  for (const [row, count] of seen) {
    if (wanted.has(row)) continue;
    for (let i = 0; i < count; i++) unexpected.push(row);
  }
  return { matched, missing, unexpected, duplicated };
}

/**
 * How far a tool has got, read from its own rows rather than from its internal
 * progress bookkeeping.
 *
 * Every tool records progress somewhere different, and several of those places
 * advance before the data is committed — which is the exact discrepancy a
 * reliability run is trying to catch. The highest block that actually has rows
 * is the position every tool can be held to.
 */
export async function highestIndexedBlock(
  url: string,
  entity: ResolvedEntity
): Promise<number> {
  const blockExpr = entity.fieldExprs[entity.roles.indexOf("blockNumber")];
  const where = entity.predicate ? ` WHERE ${entity.predicate}` : "";
  const raw = await psql(
    url,
    `SELECT coalesce(max((${blockExpr})::bigint), -1)::text FROM ${entity.qualified}${where}`
  );
  return parseInt(raw, 10);
}
