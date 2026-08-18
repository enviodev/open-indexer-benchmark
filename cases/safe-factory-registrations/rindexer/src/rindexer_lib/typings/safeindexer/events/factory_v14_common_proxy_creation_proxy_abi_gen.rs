use alloy::sol;

sol!(
    #[sol(rpc, all_derives)]
    RindexerFactoryV14CommonProxyCreationProxyGen,
    r#"[
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "contract SafeProxy", "name": "proxy", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "singleton", "type": "address"}
    ],
    "name": "ProxyCreation",
    "type": "event"
  }
]
"#
);
