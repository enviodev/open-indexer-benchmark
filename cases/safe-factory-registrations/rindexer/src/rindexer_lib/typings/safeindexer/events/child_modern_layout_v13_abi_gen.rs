use alloy::sol;

sol!(
    #[sol(rpc, all_derives)]
    RindexerChildModernLayoutV13Gen,
    r#"[
  {
    "anonymous": false,
    "type": "event",
    "name": "ExecutionSuccess",
    "inputs": [
      {
        "name": "txHash",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "payment",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "ExecutionFailure",
    "inputs": [
      {
        "name": "txHash",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "payment",
        "type": "uint256",
        "indexed": false
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "ChangedMasterCopy",
    "inputs": [
      {
        "name": "masterCopy",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "ChangedFallbackHandler",
    "inputs": [
      {
        "name": "handler",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "ChangedGuard",
    "inputs": [
      {
        "name": "guard",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "ChangedModuleGuard",
    "inputs": [
      {
        "name": "moduleGuard",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "EnabledModule",
    "inputs": [
      {
        "name": "module",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "DisabledModule",
    "inputs": [
      {
        "name": "module",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "AddedOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      }
    ]
  },
  {
    "anonymous": false,
    "type": "event",
    "name": "RemovedOwner",
    "inputs": [
      {
        "name": "owner",
        "type": "address",
        "indexed": true
      }
    ]
  }
]"#
);
