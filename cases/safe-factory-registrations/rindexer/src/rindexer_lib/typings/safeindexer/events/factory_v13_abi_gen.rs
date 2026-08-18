use alloy::sol;

sol!(
    #[sol(rpc, all_derives)]
    RindexerFactoryV13Gen,
    r#"[
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "contract GnosisSafeProxy", "name": "proxy", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "singleton", "type": "address"}
    ],
    "name": "ProxyCreation",
    "type": "event"
  }
]
"#
);
