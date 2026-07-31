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
] as const;
