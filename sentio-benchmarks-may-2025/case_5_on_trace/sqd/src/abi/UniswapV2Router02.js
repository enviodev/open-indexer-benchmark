const abi = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountOutMin",
        "type": "uint256"
      },
      {
        "internalType": "address[]",
        "name": "path",
        "type": "address[]"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "swapExactTokensForTokens",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "amounts",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const functions = {
  swapExactTokensForTokens: {
    sighash: '0x38ed1739',
    decode: (input) => {
      // Skip function selector (first 4 bytes)
      const data = input.slice(10);
      
      // Parse amountIn (uint256) - first 32 bytes
      const amountIn = BigInt('0x' + data.slice(0, 64));
      
      // Parse amountOutMin (uint256) - next 32 bytes
      const amountOutMin = BigInt('0x' + data.slice(64, 128));
      
      // Parse path array location - next 32 bytes points to array location
      const pathOffset = parseInt('0x' + data.slice(128, 192), 16) * 2 - 192;
      
      // Get array length
      const pathLength = parseInt('0x' + data.slice(192, 256), 16);
      
      // Parse path addresses
      const path = [];
      for (let i = 0; i < pathLength; i++) {
        const addrOffset = 256 + (i * 64);
        // Addresses are 20 bytes = 40 hex chars, right-padded in the 32 byte slot
        const addr = '0x' + data.slice(addrOffset + 24, addrOffset + 64);
        path.push(addr);
      }
      
      // Parse recipient address (after path array)
      const toOffset = 256 + (pathLength * 64);
      const to = '0x' + data.slice(toOffset + 24, toOffset + 64);
      
      // Parse deadline (uint256) - last 32 bytes
      const deadlineOffset = toOffset + 64;
      const deadline = BigInt('0x' + data.slice(deadlineOffset, deadlineOffset + 64));
      
      return { amountIn, amountOutMin, path, to, deadline };
    }
  }
};

module.exports = {
  abi,
  functions
}; 