"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processor = void 0;
const util_internal_1 = require("@subsquid/util-internal");
const evm_processor_1 = require("@subsquid/evm-processor");
const erc20Abi = __importStar(require("./abi/ERC20"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const CONTRACT_ADDRESS = '0xae78736cd615f374d3085123a210448e74fc6393';
const rpcEndpoint = process.env.RPC_ENDPOINT;
exports.processor = new evm_processor_1.EvmBatchProcessor()
    .setGateway('https://v2.archive.subsquid.io/network/ethereum-mainnet')
    .setRpcEndpoint({
    url: (0, util_internal_1.assertNotNull)(rpcEndpoint, 'No RPC endpoint supplied - set RPC_ENDPOINT environment variable'),
})
    .setFinalityConfirmation(75)
    .setFields({
    block: {
        timestamp: true,
    },
    log: {
        transactionHash: true,
    },
})
    .setBlockRange({
    from: 18600000,
})
    .addLog({
    address: [CONTRACT_ADDRESS],
    topic0: [
        erc20Abi.events.Transfer.topic,
        erc20Abi.events.Approval.topic,
    ],
});
//# sourceMappingURL=processor.js.map