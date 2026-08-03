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
