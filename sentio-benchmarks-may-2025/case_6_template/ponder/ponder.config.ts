import { createConfig } from "ponder";
import { http } from "viem";

const factoryAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token0",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "token1",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "pair",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "PairCreated",
    "type": "event"
  }
] as const;

const pairAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount0In",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount1In",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount0Out",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount1Out",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      }
    ],
    "name": "Swap",
    "type": "event"
  }
] as const;

export default createConfig({
  networks: {
    ethereum: {
      chainId: 1,
      transport: http(process.env.PONDER_RPC_URL_1),
    },
  },
  contracts: {
    UniswapV2Factory: {
      network: "ethereum",
      abi: factoryAbi,
      address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
      startBlock: 19000000,
      endBlock: 19010000,
    },
    UniswapV2Pair: {
      network: "ethereum",
      abi: pairAbi,
      startBlock: 19000000,
      endBlock: 19010000,
      factory: {
        address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        event: "PairCreated",
        parameter: "pair",
      },
    },
  },
});
