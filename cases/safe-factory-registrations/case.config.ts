import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaseConfig } from "../lib/case.ts";
import {
  canonicalRow,
  encodeAddress,
  encodeAmount,
  encodeSeconds,
  type EntitySpec,
} from "../lib/checksum.ts";
import { addressAtWord, uintAtWord, type DecodedLog } from "../lib/hypersync.ts";

/**
 * `ProxyCreation(address proxy, address singleton)`, and the same signature
 * with `proxy` indexed from 1.4.1 on — one topic0 either way, which is why the
 * layouts have to be told apart by the factory that emitted the log.
 */
const PROXY_CREATION_TOPIC =
  "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235";

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

// Both phases run this one range. It is sized by contract registrations rather
// than by blocks — 199,977 of them, six figures of dynamic contracts — since
// what the case has to demonstrate is that an indexer stays correct while its
// contract set grows, and the throughput phase re-runs the same configuration
// rather than a different one.
//
// It also stops here rather than at the chain head, unlike the other cases.
// Safe's deployment traffic comes in bursts: these 60,000 blocks hold the
// canonical factories' creations at 3.3 per block, and the 340,000 blocks that
// follow add only 65,000 more, a fifth of one per block. Running to the head
// would spend most of the window scanning near-empty blocks, which measures
// how fast an indexer skips rather than how it copes with a contract set
// growing underneath it.
const END_BLOCK = 24_660_000;

// ── The Safe ABI, as it is actually deployed ────────────────────────────
//
// Safe 1.4.x made one argument of eight of these events `indexed` without
// changing the signature, so those eight arrive under one topic0 in two
// incompatible layouts — and unlike `ProxyCreation`, where the emitting
// factory says which to expect, a child can emit either. Which layout a log
// carries is readable from its shape: the argument that moved is either the
// first word of the payload or the first topic, never both.

const CHILD_TOPICS = {
  safeSetup: "0x141df868a6331af528e38c83b7aa03edc19be66e37ae67f9285bf4f8e3c6a1a8",
  safeReceived: "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d",
  safeModuleTransaction:
    "0xb648d3644f584ed1c2232d53c46d87e693586486ad0d1175f8656013110b714e",
  safeMultiSigTransaction:
    "0x66753cd2356569ee081232e3be8909b950e0a76c1f8460c3a5e3c2be32b11bed",
  executionSuccess: "0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e",
  executionFailure: "0x23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23",
  changedThreshold: "0x610f7ff2b304ae8903c3de74c60c6ab1f7d6226b3f52c5161905bb5ad4039c93",
  changedMasterCopy: "0x75e41bc35ff1bf14d81d1d2f649c0084a0f974f9289c803ec9898eeec4c8d0b8",
  changedFallbackHandler:
    "0x5ac6c46c93c8d0e53714ba3b53db3e7c046da994313d7ed0d192028bc7c228b0",
  changedGuard: "0x1151116914515bc0891ff9047a6cb32cf902546f83066499bcf8ba33d2353fa2",
  changedModuleGuard: "0xcd1966d6be16bc0c030cc741a06c6e0efaf8d00de2c8b6a9e11827e125de8bb8",
  enabledModule: "0xecdf3a3effea5783a3c4c2140e677577666428d44ed9d474a0b3a4c9943f8440",
  disabledModule: "0xaab4fa2b463f581b2b32cb3b7e3b704b9ce37cc209b5fb4d77e593ace4054276",
  addedOwner: "0x9465fa0c962cc76958e6373a993326400c1c94f8be2fe3a952adfa7f60b2ea26",
  removedOwner: "0xf8d49fc529812e9a7c5c50e69c20f0dccc0db8fa95c98bc58cc9a4f1c1299eaf",
} as const;

/**
 * The reverse of `CHILD_TOPICS`. The eight events that carry one address and
 * nothing else share a single branch below, which then has to name the entity
 * the log belongs to; looking it up beats repeating eight near-identical cases.
 */
const ENTITY_OF_TOPIC = new Map(
  Object.entries(CHILD_TOPICS).map(([key, topic]) => [topic as string, key])
);

/** 32-byte words in a log's data payload. */
const wordCount = (data: string) => Math.floor((data.length - 2) / 64);

/**
 * The single address argument of an event that has exactly one — read from the
 * payload before 1.4.x and from topic1 after it. An empty payload is the tell:
 * the argument can only have gone into a topic.
 */
const soleAddressOf = (log: DecodedLog) =>
  wordCount(log.data) > 0 ? addressAtWord(log.data, 0) : log.arg0;

/**
 * `payment` of `Execution{Success,Failure}(bytes32 txHash, uint256 payment)`.
 * `txHash` was indexed in 1.4.x, which drops the payload from two words to one
 * and leaves `payment` as its last word either way. It is the only argument
 * recorded here: `txHash` is a bytes32 with no place in a checksum that
 * encodes addresses, amounts and timestamps.
 *
 * Both layouts carry at least one word, so an empty payload is not a layout
 * this code has not met — it is a truncated log, and reading it as a payment of
 * zero would bury that in a checksum nobody could trace back.
 */
const paymentOf = (data: string) => {
  const words = wordCount(data);
  if (words < 1) throw new Error(`Execution log has no data payload: ${data}`);
  return uintAtWord(data, words - 1);
};

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

/**
 * `SafeMultiSigTransaction(address to, uint256 value, bytes data, uint8
 * operation, …)`. Same head-and-tail rule: `data` is word 2's offset, so
 * `operation` is word 3.
 */
const multiSigToOf = (data: string) => addressAtWord(data, 0);
const multiSigValueOf = (data: string) => uintAtWord(data, 1);
const multiSigOperationOf = (data: string) => uintAtWord(data, 3);

// ── Entities ───────────────────────────────────────────────────────────

/** The child that emitted a log: a named column for most indexers, the generic
 * emitter column for rindexer's no-code tables. */
const SAFE_FIELD = {
  role: "safe",
  kind: "address",
  candidates: ["safe", "safe_id", "contract_address", "address", "id"],
} as const;

const TIMESTAMP_FIELD = {
  role: "timestamp",
  kind: "seconds",
  candidates: ["timestamp", "block_timestamp"],
} as const;

/**
 * Most of the Safe ABI is one address argument and nothing else, so the entity
 * is the same shape every time — only what the address is called changes.
 */
function addressEvent(
  key: string,
  label: string,
  table: string,
  role: string,
  candidates: string[]
): EntitySpec {
  return {
    key,
    label,
    tableCandidates: [table, table.replace(/_/g, "")],
    keyFieldCount: 1,
    fields: [
      SAFE_FIELD,
      { role, kind: "address", candidates },
      TIMESTAMP_FIELD,
    ],
  };
}

/** Likewise for the pair that record a payment and nothing else. */
function paymentEvent(key: string, label: string, table: string): EntitySpec {
  return {
    key,
    label,
    tableCandidates: [table, table.replace(/_/g, "")],
    keyFieldCount: 1,
    fields: [
      SAFE_FIELD,
      { role: "payment", kind: "amount", candidates: ["payment"] },
      TIMESTAMP_FIELD,
    ],
  };
}

export const caseConfig: CaseConfig = {
  name: "safe-factory-registrations",
  title: "Factory Contract Registration",
  dir: dirname(fileURLToPath(import.meta.url)),
  contract: FACTORIES,
  startBlock: START_BLOCK,
  verifyEndBlock: END_BLOCK,
  throughputEndBlock: END_BLOCK,
  topics: [PROXY_CREATION_TOPIC],

  child: {
    topics: Object.values(CHILD_TOPICS),
    childOf: proxyOf,
  },

  unsupported: {
    rindexer:
      "its factory filter takes one factory per contract — `Contract using " +
      "factory filter must use same factory across all networks` — so the " +
      "children of Safe's four canonical factory deployments cannot be " +
      "collected into one contract, and its no-code mode names tables after " +
      "events, which leaves no way to declare the eight events Safe emits " +
      "under one topic in two layouts",
  },

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
        TIMESTAMP_FIELD,
      ],
    },
    {
      key: "safeSetup",
      label: "safe setups",
      tableCandidates: ["SafeSetup", "safe_setup"],
      keyFieldCount: 1,
      fields: [
        SAFE_FIELD,
        { role: "initiator", kind: "address", candidates: ["initiator"] },
        { role: "threshold", kind: "amount", candidates: ["threshold"] },
        TIMESTAMP_FIELD,
      ],
    },
    {
      key: "safeReceived",
      label: "safe receipts",
      singular: "safe receipt",
      tableCandidates: ["SafeReceived", "safe_received"],
      keyFieldCount: 1,
      fields: [
        SAFE_FIELD,
        { role: "sender", kind: "address", candidates: ["sender"] },
        { role: "value", kind: "amount", candidates: ["value"] },
        TIMESTAMP_FIELD,
      ],
    },
    {
      key: "safeModuleTransaction",
      label: "module transactions",
      tableCandidates: ["SafeModuleTransaction", "safe_module_transaction"],
      keyFieldCount: 1,
      fields: [
        SAFE_FIELD,
        { role: "module", kind: "address", candidates: ["module"] },
        { role: "to", kind: "address", candidates: ["to"] },
        { role: "value", kind: "amount", candidates: ["value"] },
        // Ponder reserves `operation` as a column name, so it stores the
        // same value one identifier along.
        {
          role: "operation",
          kind: "amount",
          candidates: ["operation", "operation_type"],
        },
        TIMESTAMP_FIELD,
      ],
    },
    {
      key: "safeMultiSigTransaction",
      label: "multisig transactions",
      tableCandidates: ["SafeMultiSigTransaction", "safe_multi_sig_transaction"],
      keyFieldCount: 1,
      fields: [
        SAFE_FIELD,
        { role: "to", kind: "address", candidates: ["to"] },
        { role: "value", kind: "amount", candidates: ["value"] },
        {
          role: "operation",
          kind: "amount",
          candidates: ["operation", "operation_type"],
        },
        TIMESTAMP_FIELD,
      ],
    },
    paymentEvent("executionSuccess", "executions", "execution_success"),
    paymentEvent("executionFailure", "failed executions", "execution_failure"),
    {
      key: "changedThreshold",
      label: "threshold changes",
      tableCandidates: ["ChangedThreshold", "changed_threshold"],
      keyFieldCount: 1,
      fields: [
        SAFE_FIELD,
        { role: "threshold", kind: "amount", candidates: ["threshold"] },
        TIMESTAMP_FIELD,
      ],
    },
    addressEvent(
      "changedMasterCopy",
      "singleton changes",
      "changed_master_copy",
      "singleton",
      ["singleton", "master_copy"]
    ),
    addressEvent(
      "changedFallbackHandler",
      "fallback handler changes",
      "changed_fallback_handler",
      "handler",
      ["handler"]
    ),
    addressEvent("changedGuard", "guard changes", "changed_guard", "guard", ["guard"]),
    addressEvent(
      "changedModuleGuard",
      "module guard changes",
      "changed_module_guard",
      "moduleGuard",
      ["module_guard", "moduleguard"]
    ),
    addressEvent("enabledModule", "module enables", "enabled_module", "module", [
      "module",
    ]),
    addressEvent("disabledModule", "module disables", "disabled_module", "module", [
      "module",
    ]),
    addressEvent("addedOwner", "owner additions", "added_owner", "owner", ["owner"]),
    addressEvent("removedOwner", "owner removals", "removed_owner", "owner", ["owner"]),
  ],

  computeExpected(logs) {
    const rows: Record<string, string[]> = Object.fromEntries(
      ["safe", ...Object.keys(CHILD_TOPICS)].map((key) => [key, []])
    );
    // Only proxies these factories announced count as children, and
    // `fetchCaseLogs` has already restricted the child logs to those addresses.
    // Re-checking it here would have to be done in event order, which is the
    // one thing the ground truth must not do: a proxy emits its SafeSetup one
    // log index *below* the ProxyCreation announcing it, so an event-order
    // check would drop the 256 rows the case exists to make visible.

    /** Every child event opens with the proxy that emitted it. */
    const safe = (log: DecodedLog) => encodeAddress(log.address);
    const at = (log: DecodedLog) => encodeSeconds(log.timestamp);

    for (const log of logs) {
      if (log.topic0 === PROXY_CREATION_TOPIC) {
        const proxy = proxyOf(log);
        rows.safe.push(
          canonicalRow([
            encodeAddress(proxy),
            encodeAddress(singletonOf(log)),
            encodeSeconds(log.timestamp),
          ])
        );
        continue;
      }

      switch (log.topic0) {
        // A SafeSetup is emitted by the proxy itself, one log index *below* the
        // ProxyCreation that announces it — the child's event precedes its own
        // registration. Indexers that resolve the factory's child set up front
        // capture these; indexers that register strictly in event order cannot.
        case CHILD_TOPICS.safeSetup:
          rows.safeSetup.push(
            canonicalRow([
              safe(log),
              encodeAddress(log.arg0),
              encodeAmount(thresholdOf(log.data)),
              at(log),
            ])
          );
          break;

        // Everything below arrives long after the proxy was registered, so no
        // tool loses it to discovery order. What it costs is matching against a
        // contract set six figures deep: SafeReceived alone is emitted 52,882
        // times chain-wide across the throughput range against 413 for these
        // factories' children.
        case CHILD_TOPICS.safeReceived:
          rows.safeReceived.push(
            canonicalRow([
              safe(log),
              encodeAddress(log.arg0),
              encodeAmount(uintAtWord(log.data, 0)),
              at(log),
            ])
          );
          break;

        case CHILD_TOPICS.safeModuleTransaction:
          rows.safeModuleTransaction.push(
            canonicalRow([
              safe(log),
              encodeAddress(moduleOf(log.data)),
              encodeAddress(moduleToOf(log.data)),
              encodeAmount(moduleValueOf(log.data)),
              encodeAmount(operationOf(log.data)),
              at(log),
            ])
          );
          break;

        case CHILD_TOPICS.safeMultiSigTransaction:
          rows.safeMultiSigTransaction.push(
            canonicalRow([
              safe(log),
              encodeAddress(multiSigToOf(log.data)),
              encodeAmount(multiSigValueOf(log.data)),
              encodeAmount(multiSigOperationOf(log.data)),
              at(log),
            ])
          );
          break;

        case CHILD_TOPICS.executionSuccess:
          rows.executionSuccess.push(
            canonicalRow([safe(log), encodeAmount(paymentOf(log.data)), at(log)])
          );
          break;

        case CHILD_TOPICS.executionFailure:
          rows.executionFailure.push(
            canonicalRow([safe(log), encodeAmount(paymentOf(log.data)), at(log)])
          );
          break;

        case CHILD_TOPICS.changedThreshold:
          rows.changedThreshold.push(
            canonicalRow([
              safe(log),
              encodeAmount(uintAtWord(log.data, 0)),
              at(log),
            ])
          );
          break;

        // The rest carry one address and nothing else, wherever 1.4.x put it.
        case CHILD_TOPICS.changedMasterCopy:
        case CHILD_TOPICS.changedFallbackHandler:
        case CHILD_TOPICS.changedGuard:
        case CHILD_TOPICS.changedModuleGuard:
        case CHILD_TOPICS.enabledModule:
        case CHILD_TOPICS.disabledModule:
        case CHILD_TOPICS.addedOwner:
        case CHILD_TOPICS.removedOwner: {
          rows[ENTITY_OF_TOPIC.get(log.topic0)!].push(
            canonicalRow([safe(log), encodeAddress(soleAddressOf(log)), at(log)])
          );
          break;
        }
      }
    }

    return {
      totalEvents: Object.values(rows).reduce((sum, list) => sum + list.length, 0),
      entities: rows,
    };
  },

  // Each holds one row per processed event. Nothing aggregates, so their counts
  // sum to events processed.
  eventEntities: ["safe", ...Object.keys(CHILD_TOPICS)],
};
