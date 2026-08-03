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
  type DecodedLog,
  PROXY_CREATION_TOPIC,
  SAFE_SETUP_TOPIC,
} from "../lib/hypersync.ts";

/**
 * The canonical Safe (formerly Gnosis Safe) proxy factories on Ethereum
 * Mainnet. They emit the same `ProxyCreation` topic from two different event
 * layouts, which is the reason the case carries two decode paths rather than
 * one.
 *
 * `ProxyCreation(address proxy, address singleton)` — both arguments in the
 * data payload, proxy first.
 */
const FACTORIES_V1_3_0 = [
  "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2", // canonical deployment
  "0xc22834581ebc8527d974f8a1c97e1bea4ef910bc", // eip155 deployment
];

/**
 * `ProxyCreation(address indexed proxy, address singleton)` — proxy moved into
 * a topic in 1.4.1 and stayed there, so the data payload holds the singleton
 * alone. Same topic0 as above: the signature string is unchanged, only the
 * indexing of its first argument.
 */
const FACTORIES_MODERN = [
  "0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67", // canonical 1.4.1 deployment
  "0x14f2982d601c9458f93bd70b218933a6f8165e7b", // canonical 1.5.0 deployment
];

const FACTORIES = [...FACTORIES_V1_3_0, ...FACTORIES_MODERN];

const legacy = new Set(FACTORIES_V1_3_0);

/** The proxy a `ProxyCreation` announced — data word 0, or topic1 since 1.4.1. */
const proxyOf = (log: DecodedLog) =>
  legacy.has(log.address) ? addressAtWord(log.data, 0) : log.arg0;

/** The singleton it was pointed at — the word after the proxy, wherever it is. */
const singletonOf = (log: DecodedLog) =>
  addressAtWord(log.data, legacy.has(log.address) ? 1 : 0);

const START_BLOCK = 24_600_000;

// The 25,096th proxy of this run lands here. The range is sized by contract
// registrations rather than by blocks: what the phase has to demonstrate is
// that an indexer stays correct while its contract set grows into five
// figures, and the throughput window — which runs the same configuration on
// towards the chain head — is where the size of that set is measured.
const VERIFY_END_BLOCK = 24_609_162;

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
  contract: FACTORIES,
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,
  topics: [PROXY_CREATION_TOPIC],

  child: {
    topics: [SAFE_SETUP_TOPIC],
    childOf: proxyOf,
  },

  // An order of magnitude more events than the ERC-20 cases, over nine
  // thousand blocks rather than a thousand. The default fifteen minutes is not
  // enough for the slower indexers to reach the end of it, and a timeout is
  // reported as "could not verify", which would say nothing about the tool.
  phaseATimeoutS: 1_800,

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
    // Only proxies these factories announced count as children. `fetchCaseLogs`
    // already filters the child logs to those addresses, but the case logic is
    // what defines the rule, so it is applied here too rather than assumed.
    const registered = new Set<string>();

    for (const log of logs) {
      if (log.topic0 === PROXY_CREATION_TOPIC) {
        const proxy = proxyOf(log);
        registered.add(proxy);
        safes.push(
          canonicalRow([
            encodeAddress(proxy),
            encodeAddress(singletonOf(log)),
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
