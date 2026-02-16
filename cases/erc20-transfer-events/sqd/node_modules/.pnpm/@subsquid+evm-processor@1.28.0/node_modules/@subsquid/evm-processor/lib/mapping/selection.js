"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockHeaderSelectionValidator = getBlockHeaderSelectionValidator;
exports.getTxSelectionValidator = getTxSelectionValidator;
exports.getLogSelectionValidator = getLogSelectionValidator;
exports.getTraceSelectionValidator = getTraceSelectionValidator;
exports.getStateDiffSelectionValidator = getStateDiffSelectionValidator;
exports.getFieldSelectionValidator = getFieldSelectionValidator;
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const FIELD = (0, util_internal_validation_1.option)(util_internal_validation_1.BOOLEAN);
function getBlockHeaderSelectionValidator() {
    let fields = {
        nonce: FIELD,
        sha3Uncles: FIELD,
        logsBloom: FIELD,
        transactionsRoot: FIELD,
        stateRoot: FIELD,
        receiptsRoot: FIELD,
        mixHash: FIELD,
        miner: FIELD,
        difficulty: FIELD,
        totalDifficulty: FIELD,
        extraData: FIELD,
        size: FIELD,
        gasLimit: FIELD,
        gasUsed: FIELD,
        baseFeePerGas: FIELD,
        timestamp: FIELD,
        l1BlockNumber: FIELD,
    };
    return (0, util_internal_validation_1.object)(fields);
}
function getTxSelectionValidator() {
    let fields = {
        hash: FIELD,
        from: FIELD,
        to: FIELD,
        gas: FIELD,
        gasPrice: FIELD,
        maxFeePerGas: FIELD,
        maxPriorityFeePerGas: FIELD,
        sighash: FIELD,
        input: FIELD,
        nonce: FIELD,
        value: FIELD,
        v: FIELD,
        r: FIELD,
        s: FIELD,
        yParity: FIELD,
        chainId: FIELD,
        gasUsed: FIELD,
        cumulativeGasUsed: FIELD,
        effectiveGasPrice: FIELD,
        contractAddress: FIELD,
        type: FIELD,
        status: FIELD,
        l1Fee: FIELD,
        l1FeeScalar: FIELD,
        l1GasPrice: FIELD,
        l1GasUsed: FIELD,
        l1BaseFeeScalar: FIELD,
        l1BlobBaseFee: FIELD,
        l1BlobBaseFeeScalar: FIELD,
        authorizationList: FIELD,
    };
    return (0, util_internal_validation_1.object)(fields);
}
function getLogSelectionValidator() {
    let fields = {
        transactionHash: FIELD,
        address: FIELD,
        data: FIELD,
        topics: FIELD,
    };
    return (0, util_internal_validation_1.object)(fields);
}
function getTraceSelectionValidator() {
    let fields = {
        callCallType: FIELD,
        callFrom: FIELD,
        callGas: FIELD,
        callInput: FIELD,
        callResultGasUsed: FIELD,
        callResultOutput: FIELD,
        callSighash: FIELD,
        callTo: FIELD,
        callValue: FIELD,
        createFrom: FIELD,
        createGas: FIELD,
        createInit: FIELD,
        createResultAddress: FIELD,
        createResultCode: FIELD,
        createResultGasUsed: FIELD,
        createValue: FIELD,
        error: FIELD,
        revertReason: FIELD,
        rewardAuthor: FIELD,
        rewardType: FIELD,
        rewardValue: FIELD,
        subtraces: FIELD,
        suicideAddress: FIELD,
        suicideBalance: FIELD,
        suicideRefundAddress: FIELD,
    };
    return (0, util_internal_validation_1.object)(fields);
}
function getStateDiffSelectionValidator() {
    let fields = {
        kind: FIELD,
        next: FIELD,
        prev: FIELD,
    };
    return (0, util_internal_validation_1.object)(fields);
}
function getFieldSelectionValidator() {
    return (0, util_internal_validation_1.object)({
        block: (0, util_internal_validation_1.option)(getBlockHeaderSelectionValidator()),
        log: (0, util_internal_validation_1.option)(getLogSelectionValidator()),
        transaction: (0, util_internal_validation_1.option)(getTxSelectionValidator()),
        trace: (0, util_internal_validation_1.option)(getTraceSelectionValidator()),
        stateDiff: (0, util_internal_validation_1.option)(getStateDiffSelectionValidator()),
    });
}
//# sourceMappingURL=selection.js.map