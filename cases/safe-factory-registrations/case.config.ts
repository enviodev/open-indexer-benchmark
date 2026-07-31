import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseConfig } from "../lib/case.ts";
import {
  canonicalRow,
  encodeAddress,
  encodeAmount,
  encodeSeconds,
} from "../lib/checksum.ts";
import {
  addressAtWord,
  uintAtWord,
  PROXY_CREATION_TOPIC,
  SAFE_SETUP_TOPIC,
} from "../lib/hypersync.ts";

/** Safe (formerly Gnosis Safe) proxy factory v1.3.0 on Ethereum Mainnet. */
const FACTORY = "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2";

const START_BLOCK = 24_600_000;

// The 100,037th proxy of this run lands here. The range is sized by contract
// registrations rather than by blocks: the point of the case is the size of the
// dynamic contract set, and 100k children is where the bookkeeping an indexer
// keeps per registered contract stops being free.
const VERIFY_END_BLOCK = 24_646_610;

/**
 * `ProxyCreation(address proxy, address singleton)` — both arguments sit in the
 * data payload, proxy first.
 */
const proxyOf = (data: string) => addressAtWord(data, 0);
const singletonOf = (data: string) => addressAtWord(data, 1);

/**
 * `SafeSetup(address indexed initiator, address[] owners, uint256 threshold,
 * address initializer, address fallbackHandler)`. The dynamic `owners` array is
 * a head-and-tail encoding, so word 0 is only its offset; `threshold` is word 1.
 */
const thresholdOf = (data: string) => uintAtWord(data, 1);

export const caseConfig: CaseConfig = {
  name: "safe-factory-registrations",
  title: "Factory Contract Registration",
  dir: dirname(fileURLToPath(import.meta.url)),
  contract: FACTORY,
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,
  topics: [PROXY_CREATION_TOPIC],

  child: {
    topics: [SAFE_SETUP_TOPIC],
    childOf: (log) => proxyOf(log.data),
  },

  // Two orders of magnitude more events than the ERC-20 cases, over forty-six
  // thousand blocks rather than a thousand. The default fifteen minutes is not
  // enough for the slower indexers to reach the end of it, and a timeout is
  // reported as "could not verify", which would say nothing about the tool.
  phaseATimeoutS: 2_400,

  entities: [
    {
      key: "safe",
      label: "safes",
      // rindexer's no-code mode names tables after events rather than
      // entities, so the factory event's own name is a candidate too.
      tableCandidates: ["Safe", "safe", "proxy_creation"],
      keyFieldCount: 1,
      fields: [
        { role: "address", kind: "address", candidates: ["proxy", "address", "id"] },
        {
          role: "singleton",
          kind: "address",
          candidates: ["singleton", "mastercopy", "implementation"],
        },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
    {
      key: "safeSetup",
      label: "safe setups",
      tableCandidates: ["SafeSetup", "safe_setup"],
      keyFieldCount: 1,
      fields: [
        {
          role: "safe",
          kind: "address",
          // The child that emitted it: an explicit column for most indexers,
          // the generic emitter column for rindexer's no-code tables.
          candidates: ["safe", "safe_id", "contract_address", "address", "id"],
        },
        { role: "initiator", kind: "address", candidates: ["initiator"] },
        { role: "threshold", kind: "amount", candidates: ["threshold"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
  ],

  computeExpected(logs) {
    const safes: string[] = [];
    const setups: string[] = [];
    // Only proxies this factory announced count as children. `fetchCaseLogs`
    // already filters the child logs to those addresses, but the case logic is
    // what defines the rule, so it is applied here too rather than assumed.
    const registered = new Set<string>();

    for (const log of logs) {
      if (log.topic0 === PROXY_CREATION_TOPIC) {
        const proxy = proxyOf(log.data);
        registered.add(proxy);
        safes.push(
          canonicalRow([
            encodeAddress(proxy),
            encodeAddress(singletonOf(log.data)),
            encodeSeconds(log.timestamp),
          ])
        );
        continue;
      }

      // A SafeSetup is emitted by the proxy itself, one log index *below* the
      // ProxyCreation that announces it — the child's event precedes its own
      // registration. Indexers that resolve the factory's child set up front
      // capture these; indexers that register strictly in event order cannot.
      if (log.topic0 === SAFE_SETUP_TOPIC) {
        setups.push(
          canonicalRow([
            encodeAddress(log.address),
            encodeAddress(log.arg0),
            encodeAmount(thresholdOf(log.data)),
            encodeSeconds(log.timestamp),
          ])
        );
      }
    }

    return {
      totalEvents: safes.length + setups.length,
      entities: { safe: safes, safeSetup: setups },
    };
  },

  // Both hold one row per processed event: a safe per ProxyCreation, a setup
  // per SafeSetup. Neither aggregates, so their counts sum to events processed.
  eventEntities: ["safe", "safeSetup"],
};
