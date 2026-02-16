"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceStateDiff = exports.TraceFrame = exports.DebugStateDiffResult = exports.DebugStateDiff = exports.DebugStateMap = exports.DebugFrameResult = exports.DebugFrame = exports.TransactionReceipt = exports.Log = exports.GetBlockNoTransactions = exports.GetBlockWithTransactions = void 0;
exports.getTraceTransactionReplayValidator = getTraceTransactionReplayValidator;
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const schema_1 = require("../mapping/schema");
const Transaction = (0, util_internal_validation_1.object)({
    blockNumber: util_internal_validation_1.SMALL_QTY,
    blockHash: util_internal_validation_1.BYTES,
    transactionIndex: util_internal_validation_1.SMALL_QTY,
    hash: util_internal_validation_1.BYTES,
    input: util_internal_validation_1.BYTES
});
exports.GetBlockWithTransactions = (0, util_internal_validation_1.object)({
    number: util_internal_validation_1.SMALL_QTY,
    hash: util_internal_validation_1.BYTES,
    parentHash: util_internal_validation_1.BYTES,
    logsBloom: util_internal_validation_1.BYTES,
    transactions: (0, util_internal_validation_1.array)(Transaction)
});
exports.GetBlockNoTransactions = (0, util_internal_validation_1.object)({
    number: util_internal_validation_1.SMALL_QTY,
    hash: util_internal_validation_1.BYTES,
    parentHash: util_internal_validation_1.BYTES,
    logsBloom: util_internal_validation_1.BYTES,
    transactions: (0, util_internal_validation_1.array)(util_internal_validation_1.BYTES)
});
exports.Log = (0, util_internal_validation_1.object)({
    blockNumber: util_internal_validation_1.SMALL_QTY,
    blockHash: util_internal_validation_1.BYTES,
    logIndex: util_internal_validation_1.SMALL_QTY,
    transactionIndex: util_internal_validation_1.SMALL_QTY
});
exports.TransactionReceipt = (0, util_internal_validation_1.object)({
    blockNumber: util_internal_validation_1.SMALL_QTY,
    blockHash: util_internal_validation_1.BYTES,
    transactionIndex: util_internal_validation_1.SMALL_QTY,
    transactionHash: util_internal_validation_1.BYTES,
    logs: (0, util_internal_validation_1.array)(exports.Log)
});
exports.DebugFrame = (0, util_internal_validation_1.object)({
    type: util_internal_validation_1.STRING,
    input: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES),
    calls: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)((0, util_internal_validation_1.ref)(() => exports.DebugFrame)))
});
exports.DebugFrameResult = (0, util_internal_validation_1.object)({
    result: exports.DebugFrame,
    txHash: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES)
});
exports.DebugStateMap = (0, util_internal_validation_1.object)({
    balance: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
    code: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
    nonce: (0, util_internal_validation_1.option)(util_internal_validation_1.NAT),
    storage: (0, util_internal_validation_1.option)((0, util_internal_validation_1.record)(util_internal_validation_1.BYTES, util_internal_validation_1.BYTES))
});
exports.DebugStateDiff = (0, util_internal_validation_1.object)({
    pre: (0, util_internal_validation_1.record)(util_internal_validation_1.BYTES, exports.DebugStateMap),
    post: (0, util_internal_validation_1.record)(util_internal_validation_1.BYTES, exports.DebugStateMap)
});
exports.DebugStateDiffResult = (0, util_internal_validation_1.object)({
    result: exports.DebugStateDiff,
    txHash: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES)
});
exports.TraceFrame = (0, util_internal_validation_1.object)({
    blockHash: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
    transactionHash: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
    traceAddress: (0, util_internal_validation_1.array)(util_internal_validation_1.NAT),
    type: util_internal_validation_1.STRING,
    action: (0, util_internal_validation_1.object)({})
});
const TraceDiffObj = (0, util_internal_validation_1.keyTaggedUnion)({
    '+': util_internal_validation_1.BYTES,
    '*': (0, util_internal_validation_1.object)({ from: util_internal_validation_1.BYTES, to: util_internal_validation_1.BYTES }),
    '-': util_internal_validation_1.BYTES
});
const TraceDiff = (0, util_internal_validation_1.oneOf)({
    '= sign': (0, util_internal_validation_1.constant)('='),
    'diff object': TraceDiffObj
});
exports.TraceStateDiff = (0, util_internal_validation_1.object)({
    balance: TraceDiff,
    code: TraceDiff,
    nonce: TraceDiff,
    storage: (0, util_internal_validation_1.record)(util_internal_validation_1.BYTES, TraceDiff)
});
function getTraceTransactionReplayValidator(tracers) {
    return (0, util_internal_validation_1.object)({
        transactionHash: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
        ...(0, schema_1.project)(tracers, {
            trace: (0, util_internal_validation_1.array)(exports.TraceFrame),
            stateDiff: (0, util_internal_validation_1.record)(util_internal_validation_1.BYTES, exports.TraceStateDiff)
        })
    });
}
//# sourceMappingURL=rpc-data.js.map