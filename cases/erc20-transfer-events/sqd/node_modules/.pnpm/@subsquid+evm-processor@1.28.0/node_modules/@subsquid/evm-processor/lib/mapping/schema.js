"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockHeaderProps = getBlockHeaderProps;
exports.getTxProps = getTxProps;
exports.getTxReceiptProps = getTxReceiptProps;
exports.getLogProps = getLogProps;
exports.getTraceFrameValidator = getTraceFrameValidator;
exports.project = project;
exports.isEmpty = isEmpty;
exports.assertAssignable = assertAssignable;
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
function getBlockHeaderProps(fields, forArchive) {
    let natural = forArchive ? util_internal_validation_1.NAT : util_internal_validation_1.SMALL_QTY;
    return {
        number: natural,
        hash: util_internal_validation_1.BYTES,
        parentHash: util_internal_validation_1.BYTES,
        ...project(fields, {
            nonce: (0, util_internal_validation_1.withSentinel)('BlockHeader.nonce', '0x', util_internal_validation_1.BYTES),
            sha3Uncles: (0, util_internal_validation_1.withSentinel)('BlockHeader.sha3Uncles', '0x', util_internal_validation_1.BYTES),
            logsBloom: (0, util_internal_validation_1.withSentinel)('BlockHeader.logsBloom', '0x', util_internal_validation_1.BYTES),
            transactionsRoot: (0, util_internal_validation_1.withSentinel)('BlockHeader.transactionsRoot', '0x', util_internal_validation_1.BYTES),
            stateRoot: (0, util_internal_validation_1.withSentinel)('BlockHeader.stateRoot', '0x', util_internal_validation_1.BYTES),
            receiptsRoot: (0, util_internal_validation_1.withSentinel)('BlockHeader.receiptsRoot', '0x', util_internal_validation_1.BYTES),
            mixHash: (0, util_internal_validation_1.withSentinel)('BlockHeader.mixHash', '0x', util_internal_validation_1.BYTES),
            miner: (0, util_internal_validation_1.withSentinel)('BlockHeader.miner', '0x', util_internal_validation_1.BYTES),
            difficulty: (0, util_internal_validation_1.withSentinel)('BlockHeader.difficulty', -1n, util_internal_validation_1.QTY),
            totalDifficulty: (0, util_internal_validation_1.withSentinel)('BlockHeader.totalDifficulty', -1n, util_internal_validation_1.QTY),
            extraData: (0, util_internal_validation_1.withSentinel)('BlockHeader.extraData', '0x', util_internal_validation_1.BYTES),
            size: (0, util_internal_validation_1.withSentinel)('BlockHeader.size', -1, natural),
            gasLimit: (0, util_internal_validation_1.withSentinel)('BlockHeader.gasLimit', -1n, util_internal_validation_1.QTY),
            gasUsed: (0, util_internal_validation_1.withSentinel)('BlockHeader.gasUsed', -1n, util_internal_validation_1.QTY),
            baseFeePerGas: (0, util_internal_validation_1.withSentinel)('BlockHeader.baseFeePerGas', -1n, util_internal_validation_1.QTY),
            timestamp: (0, util_internal_validation_1.withSentinel)('BlockHeader.timestamp', 0, natural),
            l1BlockNumber: (0, util_internal_validation_1.withDefault)(0, natural),
        })
    };
}
function getTxProps(fields, forArchive) {
    let natural = forArchive ? util_internal_validation_1.NAT : util_internal_validation_1.SMALL_QTY;
    let Authorization = (0, util_internal_validation_1.object)({
        chainId: natural,
        nonce: natural,
        address: util_internal_validation_1.BYTES,
        yParity: natural,
        r: util_internal_validation_1.BYTES,
        s: util_internal_validation_1.BYTES,
    });
    return {
        transactionIndex: natural,
        ...project(fields, {
            hash: util_internal_validation_1.BYTES,
            from: util_internal_validation_1.BYTES,
            to: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
            gas: (0, util_internal_validation_1.withSentinel)('Transaction.gas', -1n, util_internal_validation_1.QTY),
            gasPrice: (0, util_internal_validation_1.withSentinel)('Transaction.gasPrice', -1n, util_internal_validation_1.QTY),
            maxFeePerGas: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
            maxPriorityFeePerGas: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
            input: util_internal_validation_1.BYTES,
            nonce: (0, util_internal_validation_1.withSentinel)('Transaction.nonce', -1, natural),
            value: (0, util_internal_validation_1.withSentinel)('Transaction.value', -1n, util_internal_validation_1.QTY),
            v: (0, util_internal_validation_1.withSentinel)('Transaction.v', -1n, util_internal_validation_1.QTY),
            r: (0, util_internal_validation_1.withSentinel)('Transaction.r', '0x', util_internal_validation_1.BYTES),
            s: (0, util_internal_validation_1.withSentinel)('Transaction.s', '0x', util_internal_validation_1.BYTES),
            yParity: (0, util_internal_validation_1.option)(natural),
            chainId: (0, util_internal_validation_1.option)(natural),
            authorizationList: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)(Authorization)),
        })
    };
}
function getTxReceiptProps(fields, forArchive) {
    let natural = forArchive ? util_internal_validation_1.NAT : util_internal_validation_1.SMALL_QTY;
    return project(fields, {
        gasUsed: (0, util_internal_validation_1.withSentinel)('Receipt.gasUsed', -1n, util_internal_validation_1.QTY),
        cumulativeGasUsed: (0, util_internal_validation_1.withSentinel)('Receipt.cumulativeGasUsed', -1n, util_internal_validation_1.QTY),
        effectiveGasPrice: (0, util_internal_validation_1.withSentinel)('Receipt.effectiveGasPrice', -1n, util_internal_validation_1.QTY),
        contractAddress: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
        type: (0, util_internal_validation_1.withSentinel)('Receipt.type', -1, natural),
        status: (0, util_internal_validation_1.withSentinel)('Receipt.status', -1, natural),
        l1Fee: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
        l1FeeScalar: (0, util_internal_validation_1.option)(util_internal_validation_1.STRING_FLOAT),
        l1GasPrice: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
        l1GasUsed: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
        l1BlobBaseFee: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
        l1BlobBaseFeeScalar: (0, util_internal_validation_1.option)(natural),
        l1BaseFeeScalar: (0, util_internal_validation_1.option)(natural),
    });
}
function getLogProps(fields, forArchive) {
    let natural = forArchive ? util_internal_validation_1.NAT : util_internal_validation_1.SMALL_QTY;
    return {
        logIndex: natural,
        transactionIndex: natural,
        ...project(fields, {
            transactionHash: util_internal_validation_1.BYTES,
            address: util_internal_validation_1.BYTES,
            data: util_internal_validation_1.BYTES,
            topics: (0, util_internal_validation_1.array)(util_internal_validation_1.BYTES)
        })
    };
}
function getTraceFrameValidator(fields, forArchive) {
    let traceBase = {
        transactionIndex: forArchive ? util_internal_validation_1.NAT : undefined,
        traceAddress: (0, util_internal_validation_1.array)(util_internal_validation_1.NAT),
        ...project(fields, {
            subtraces: util_internal_validation_1.NAT,
            error: (0, util_internal_validation_1.option)(util_internal_validation_1.STRING),
            revertReason: (0, util_internal_validation_1.option)(util_internal_validation_1.STRING)
        })
    };
    let traceCreateAction = project({
        from: fields?.createFrom || !forArchive,
        value: fields?.createValue,
        gas: fields?.createGas,
        init: fields?.createInit
    }, {
        from: util_internal_validation_1.BYTES,
        value: util_internal_validation_1.QTY,
        gas: util_internal_validation_1.QTY,
        init: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES),
    });
    let traceCreateResult = project({
        gasUsed: fields?.createResultGasUsed,
        code: fields?.createResultCode,
        address: fields?.createResultAddress
    }, {
        gasUsed: util_internal_validation_1.QTY,
        code: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES),
        address: (0, util_internal_validation_1.withDefault)(ZERO_ADDRESS, util_internal_validation_1.BYTES)
    });
    let TraceCreate = (0, util_internal_validation_1.object)({
        ...traceBase,
        action: isEmpty(traceCreateAction) ? undefined : (0, util_internal_validation_1.object)(traceCreateAction),
        result: isEmpty(traceCreateResult) ? undefined : (0, util_internal_validation_1.option)((0, util_internal_validation_1.object)(traceCreateResult))
    });
    let traceCallAction = project({
        callType: fields?.callCallType,
        from: forArchive ? fields?.callFrom : true,
        to: forArchive ? fields?.callTo : true,
        value: fields?.callValue,
        gas: fields?.callGas,
        input: forArchive ? fields?.callInput : true,
        sighash: forArchive ? fields?.callSighash : false
    }, {
        callType: util_internal_validation_1.STRING,
        from: util_internal_validation_1.BYTES,
        to: util_internal_validation_1.BYTES,
        value: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
        gas: util_internal_validation_1.QTY,
        input: util_internal_validation_1.BYTES,
        sighash: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES)
    });
    let traceCallResult = project({
        gasUsed: fields?.callResultGasUsed,
        output: fields?.callResultOutput
    }, {
        gasUsed: util_internal_validation_1.QTY,
        output: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES)
    });
    let TraceCall = (0, util_internal_validation_1.object)({
        ...traceBase,
        action: isEmpty(traceCallAction) ? undefined : (0, util_internal_validation_1.object)(traceCallAction),
        result: isEmpty(traceCallResult) ? undefined : (0, util_internal_validation_1.option)((0, util_internal_validation_1.object)(traceCallResult))
    });
    let traceSuicideAction = project({
        address: fields?.suicideAddress,
        refundAddress: forArchive ? fields?.suicideRefundAddress : true,
        balance: fields?.suicideBalance
    }, {
        address: util_internal_validation_1.BYTES,
        refundAddress: (0, util_internal_validation_1.withDefault)(ZERO_ADDRESS, util_internal_validation_1.BYTES),
        balance: util_internal_validation_1.QTY
    });
    let TraceSuicide = (0, util_internal_validation_1.object)({
        ...traceBase,
        action: isEmpty(traceSuicideAction) ? undefined : (0, util_internal_validation_1.object)(traceSuicideAction)
    });
    let traceRewardAction = project({
        author: forArchive ? fields?.rewardAuthor : true,
        value: fields?.rewardValue,
        type: fields?.rewardType
    }, {
        author: util_internal_validation_1.BYTES,
        value: util_internal_validation_1.QTY,
        type: util_internal_validation_1.STRING
    });
    let TraceReward = (0, util_internal_validation_1.object)({
        ...traceBase,
        action: isEmpty(traceRewardAction) ? undefined : (0, util_internal_validation_1.object)(traceRewardAction)
    });
    return (0, util_internal_validation_1.taggedUnion)('type', {
        create: TraceCreate,
        call: TraceCall,
        suicide: TraceSuicide,
        reward: TraceReward
    });
}
function project(fields, obj) {
    if (fields == null)
        return {};
    let result = {};
    let key;
    for (key in obj) {
        if (fields[key]) {
            result[key] = obj[key];
        }
    }
    return result;
}
function isEmpty(obj) {
    for (let _ in obj) {
        return false;
    }
    return true;
}
function assertAssignable() { }
//# sourceMappingURL=schema.js.map