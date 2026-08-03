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
  SAFE_MODULE_TRANSACTION_TOPIC,
  SAFE_RECEIVED_TOPIC,
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

// The throughput window stops here rather than at the chain head. Safe's
// deployment traffic comes in bursts: these 60,000 blocks hold 199,977 of the
// canonical factories' creations at 3.3 per block, and the 340,000 blocks that
// follow add only 65,000 more at a tenth of the density. Running to the head
// would spend most of the window scanning near-empty blocks, which measures
// how fast an indexer skips rather than how it copes with a contract set
// growing underneath it.
const THROUGHPUT_END_BLOCK = 24_660_000;

/**
 * `SafeSetup(address indexed initiator, address[] owners, uint256 threshold,
 * address initializer, address fallbackHandler)`. The dynamic `owners` array is
 * a head-and-tail encoding, so word 0 is only its offset; `threshold` is word 1.
 */
const thresholdOf = (data: string) => uintAtWord(data, 1);

/**
 * `SafeModuleTransaction(address module, address to, uint256 value, bytes
 * data, uint8 operation)`. Everything is in the payload, and the `bytes` in the
 * middle is a head-and-tail encoding, so word 3 is only its offset and
 * `operation` follows at word 4.
 */
const moduleOf = (data: string) => addressAtWord(data, 0);
const moduleToOf = (data: string) => addressAtWord(data, 1);
const moduleValueOf = (data: string) => uintAtWord(data, 2);
const operationOf = (data: string) => uintAtWord(data, 4);

export const caseConfig: CaseConfig = {
  name: "safe-factory-registrations",
  title: "Factory Contract Registration",
  dir: dirname(fileURLToPath(import.meta.url)),
  contract: FACTORIES,
  startBlock: START_BLOCK,
  verifyEndBlock: VERIFY_END_BLOCK,
  throughputEndBlock: THROUGHPUT_END_BLOCK,
  topics: [PROXY_CREATION_TOPIC],

  child: {
    topics: [SAFE_SETUP_TOPIC, SAFE_RECEIVED_TOPIC, SAFE_MODULE_TRANSACTION_TOPIC],
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
    {
      key: "safeReceived",
      label: "safe receipts",
      singular: "safe receipt",
      tableCandidates: ["SafeReceived", "safe_received"],
      keyFieldCount: 1,
      fields: [
        {
          role: "safe",
          kind: "address",
          candidates: ["safe", "safe_id", "contract_address", "address", "id"],
        },
        { role: "sender", kind: "address", candidates: ["sender"] },
        { role: "value", kind: "amount", candidates: ["value"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
    {
      key: "safeModuleTransaction",
      label: "module transactions",
      tableCandidates: ["SafeModuleTransaction", "safe_module_transaction"],
      keyFieldCount: 1,
      fields: [
        {
          role: "safe",
          kind: "address",
          candidates: ["safe", "safe_id", "contract_address", "address", "id"],
        },
        { role: "module", kind: "address", candidates: ["module"] },
        { role: "to", kind: "address", candidates: ["to"] },
        { role: "value", kind: "amount", candidates: ["value"] },
        { role: "operation", kind: "amount", candidates: ["operation"] },
        { role: "timestamp", kind: "seconds", candidates: ["timestamp", "block_timestamp"] },
      ],
    },
  ],

  computeExpected(logs) {
    const safes: string[] = [];
    const setups: string[] = [];
    const receipts: string[] = [];
    const moduleTransactions: string[] = [];
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
        continue;
      }

      // The two events a registered proxy goes on emitting for the rest of its
      // life. Unlike SafeSetup they arrive long after registration, so every
      // tool that registers the proxy at all sees them; what they cost is
      // matching them against a contract set six figures deep. SafeReceived in
      // particular is emitted 52,882 times chain-wide across the throughput
      // range against 413 for this factory's children, so a tool that
      // subscribes by topic and filters locally pays for all of them.
      if (log.topic0 === SAFE_RECEIVED_TOPIC) {
        receipts.push(
          canonicalRow([
            encodeAddress(log.address),
            encodeAddress(log.arg0),
            encodeAmount(uintAtWord(log.data, 0)),
            encodeSeconds(log.timestamp),
          ])
        );
        continue;
      }

      if (log.topic0 === SAFE_MODULE_TRANSACTION_TOPIC) {
        moduleTransactions.push(
          canonicalRow([
            encodeAddress(log.address),
            encodeAddress(moduleOf(log.data)),
            encodeAddress(moduleToOf(log.data)),
            encodeAmount(moduleValueOf(log.data)),
            encodeAmount(operationOf(log.data)),
            encodeSeconds(log.timestamp),
          ])
        );
      }
    }

    return {
      totalEvents:
        safes.length + setups.length + receipts.length + moduleTransactions.length,
      entities: {
        safe: safes,
        safeSetup: setups,
        safeReceived: receipts,
        safeModuleTransaction: moduleTransactions,
      },
    };
  },

  // Each holds one row per processed event. Nothing aggregates, so their counts
  // sum to events processed.
  eventEntities: ["safe", "safeSetup", "safeReceived", "safeModuleTransaction"],
};
