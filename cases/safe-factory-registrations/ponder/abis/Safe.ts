export const SafeProxyFactoryAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "contract GnosisSafeProxy", name: "proxy", type: "address" },
      { indexed: false, internalType: "address", name: "singleton", type: "address" },
    ],
    name: "ProxyCreation",
    type: "event",
  },
] as const;

// Same event signature, and so the same topic0 — `proxy` became indexed in
// 1.4.1, which moves it out of the data payload and makes the two layouts
// mutually undecodable.
export const SafeProxyFactoryModernAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "contract SafeProxy", name: "proxy", type: "address" },
      { indexed: false, internalType: "address", name: "singleton", type: "address" },
    ],
    name: "ProxyCreation",
    type: "event",
  },
] as const;

// The child ABI. Eight of these events made an argument `indexed` in Safe
// 1.4.x without changing the signature, so they appear twice — same topic0,
// different payload. Ponder names an overloaded event by its full signature,
// which is how the two are told apart in `src/index.ts`.
export const SafeAbi = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "initiator", type: "address" },
      { indexed: false, internalType: "address[]", name: "owners", type: "address[]" },
      { indexed: false, internalType: "uint256", name: "threshold", type: "uint256" },
      { indexed: false, internalType: "address", name: "initializer", type: "address" },
      { indexed: false, internalType: "address", name: "fallbackHandler", type: "address" },
    ],
    name: "SafeSetup",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "sender", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "SafeReceived",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "module", type: "address" },
      { indexed: false, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
      { indexed: false, internalType: "bytes", name: "data", type: "bytes" },
      { indexed: false, internalType: "uint8", name: "operation", type: "uint8" },
    ],
    name: "SafeModuleTransaction",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
      { indexed: false, internalType: "bytes", name: "data", type: "bytes" },
      { indexed: false, internalType: "uint8", name: "operation", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "safeTxGas", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "baseGas", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "gasPrice", type: "uint256" },
      { indexed: false, internalType: "address", name: "gasToken", type: "address" },
      { indexed: false, internalType: "address", name: "refundReceiver", type: "address" },
      { indexed: false, internalType: "bytes", name: "signatures", type: "bytes" },
      { indexed: false, internalType: "bytes", name: "additionalInfo", type: "bytes" },
    ],
    name: "SafeMultiSigTransaction",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "payment", type: "uint256" },
    ],
    name: "ExecutionSuccess",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "payment", type: "uint256" },
    ],
    name: "ExecutionSuccess",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "payment", type: "uint256" },
    ],
    name: "ExecutionFailure",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "txHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "payment", type: "uint256" },
    ],
    name: "ExecutionFailure",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "threshold", type: "uint256" },
    ],
    name: "ChangedThreshold",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "singleton", type: "address" },
    ],
    name: "ChangedMasterCopy",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "handler", type: "address" },
    ],
    name: "ChangedFallbackHandler",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "handler", type: "address" },
    ],
    name: "ChangedFallbackHandler",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "guard", type: "address" },
    ],
    name: "ChangedGuard",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "guard", type: "address" },
    ],
    name: "ChangedGuard",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "moduleGuard", type: "address" },
    ],
    name: "ChangedModuleGuard",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "module", type: "address" },
    ],
    name: "EnabledModule",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "module", type: "address" },
    ],
    name: "EnabledModule",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "module", type: "address" },
    ],
    name: "DisabledModule",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "module", type: "address" },
    ],
    name: "DisabledModule",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "owner", type: "address" },
    ],
    name: "AddedOwner",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
    ],
    name: "AddedOwner",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "owner", type: "address" },
    ],
    name: "RemovedOwner",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
    ],
    name: "RemovedOwner",
    type: "event",
  },
] as const;
