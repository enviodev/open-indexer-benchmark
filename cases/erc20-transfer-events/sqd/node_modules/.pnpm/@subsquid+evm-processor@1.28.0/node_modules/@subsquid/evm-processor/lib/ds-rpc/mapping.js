"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapBlock = mapBlock;
const util_internal_1 = require("@subsquid/util-internal");
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const assert_1 = __importDefault(require("assert"));
const entities_1 = require("../mapping/entities");
const relations_1 = require("../mapping/relations");
const schema_1 = require("../mapping/schema");
const filter_1 = require("./filter");
const schema_2 = require("./schema");
const util_1 = require("./util");
function mapBlock(rpcBlock, req) {
    try {
        return tryMapBlock(rpcBlock, req);
    }
    catch (err) {
        throw (0, util_internal_1.addErrorContext)(err, {
            blockHash: rpcBlock.hash,
            blockHeight: rpcBlock.height
        });
    }
}
function tryMapBlock(rpcBlock, req) {
    let src = (0, util_internal_validation_1.cast)((0, schema_2.getBlockValidator)(req), rpcBlock);
    let { number, hash, parentHash, transactions, ...headerProps } = src.block;
    if (headerProps.timestamp) {
        headerProps.timestamp = headerProps.timestamp * 1000; // convert to ms
    }
    let header = new entities_1.BlockHeader(number, hash, parentHash);
    Object.assign(header, headerProps);
    let block = new entities_1.Block(header);
    if (req.transactionList) {
        for (let i = 0; i < transactions.length; i++) {
            let stx = transactions[i];
            let tx = new entities_1.Transaction(header, i);
            if (typeof stx == 'string') {
                if (req.fields.transaction?.hash) {
                    tx.hash = stx;
                }
            }
            else {
                let { transactionIndex, ...props } = stx;
                Object.assign(tx, props);
                (0, assert_1.default)(transactionIndex === i);
                if (tx.input != null) {
                    tx.sighash = tx.input.slice(0, 10);
                }
            }
            block.transactions.push(tx);
        }
    }
    if (req.receipts) {
        let receipts = (0, util_internal_1.assertNotNull)(src.receipts);
        for (let i = 0; i < receipts.length; i++) {
            let { transactionIndex, transactionHash, logs, ...props } = receipts[i];
            let transaction = block.transactions[i];
            (0, assert_1.default)(transactionHash === transaction.hash);
            Object.assign(transaction, props);
            if (req.logList) {
                for (let log of (0, util_internal_1.assertNotNull)(logs)) {
                    block.logs.push(makeLog(header, log));
                }
            }
        }
    }
    if (src.logs) {
        (0, assert_1.default)(block.logs.length == 0);
        for (let log of src.logs) {
            block.logs.push(makeLog(header, log));
        }
    }
    if (src.traceReplays) {
        let txIndex = new Map(src.block.transactions.map((tx, idx) => {
            return [(0, util_1.getTxHash)(tx), idx];
        }));
        for (let rep of src.traceReplays) {
            let transactionIndex = (0, util_internal_1.assertNotNull)(txIndex.get(rep.transactionHash));
            if (rep.trace) {
                for (let frame of rep.trace) {
                    block.traces.push(makeTraceRecordFromReplayFrame(header, transactionIndex, frame));
                }
            }
            if (rep.stateDiff) {
                for (let diff of mapReplayStateDiff(header, transactionIndex, rep.stateDiff)) {
                    if (diff.kind != '=') {
                        block.stateDiffs.push(diff);
                    }
                }
            }
        }
    }
    if (src.debugFrames) {
        (0, assert_1.default)(block.traces.length == 0);
        for (let i = 0; i < src.debugFrames.length; i++) {
            let frame = src.debugFrames[i];
            if (frame == null)
                continue;
            for (let trace of mapDebugFrame(header, i, frame, req.fields)) {
                block.traces.push(trace);
            }
        }
    }
    if (src.debugStateDiffs) {
        (0, assert_1.default)(block.stateDiffs.length == 0);
        for (let i = 0; i < src.debugStateDiffs.length; i++) {
            for (let diff of mapDebugStateDiff(header, i, src.debugStateDiffs[i])) {
                block.stateDiffs.push(diff);
            }
        }
    }
    (0, relations_1.setUpRelations)(block);
    (0, filter_1.filterBlock)(block, req.dataRequest);
    return block;
}
function makeLog(blockHeader, src) {
    let { logIndex, transactionIndex, ...props } = src;
    let log = new entities_1.Log(blockHeader, logIndex, transactionIndex);
    Object.assign(log, props);
    return log;
}
function makeTraceRecordFromReplayFrame(header, transactionIndex, frame) {
    let { traceAddress, type, ...props } = frame;
    let trace;
    switch (type) {
        case 'create':
            trace = new entities_1.TraceCreate(header, transactionIndex, traceAddress);
            break;
        case 'call':
            trace = new entities_1.TraceCall(header, transactionIndex, traceAddress);
            break;
        case 'suicide':
            trace = new entities_1.TraceSuicide(header, transactionIndex, traceAddress);
            break;
        case 'reward':
            trace = new entities_1.TraceReward(header, transactionIndex, traceAddress);
            break;
        default:
            throw (0, util_internal_1.unexpectedCase)(type);
    }
    Object.assign(trace, props);
    if (trace.type == 'call' && trace.action?.input != null) {
        trace.action.sighash = trace.action.input.slice(0, 10);
    }
    return trace;
}
function* mapReplayStateDiff(header, transactionIndex, stateDiff) {
    for (let address in stateDiff) {
        let diffs = stateDiff[address];
        yield makeStateDiffFromReplay(header, transactionIndex, address, 'code', diffs.code);
        yield makeStateDiffFromReplay(header, transactionIndex, address, 'balance', diffs.balance);
        yield makeStateDiffFromReplay(header, transactionIndex, address, 'nonce', diffs.nonce);
        for (let key in diffs.storage) {
            yield makeStateDiffFromReplay(header, transactionIndex, address, key, diffs.storage[key]);
        }
    }
}
function makeStateDiffFromReplay(header, transactionIndex, address, key, diff) {
    if (diff === '=') {
        return new entities_1.StateDiffNoChange(header, transactionIndex, address, key);
    }
    if (diff['+']) {
        let rec = new entities_1.StateDiffAdd(header, transactionIndex, address, key);
        rec.next = diff['+'];
        return rec;
    }
    if (diff['*']) {
        let rec = new entities_1.StateDiffChange(header, transactionIndex, address, key);
        rec.prev = diff['*'].from;
        rec.next = diff['*'].to;
        return rec;
    }
    if (diff['-']) {
        let rec = new entities_1.StateDiffDelete(header, transactionIndex, address, key);
        rec.prev = diff['-'];
        return rec;
    }
    throw (0, util_internal_1.unexpectedCase)();
}
function* mapDebugFrame(header, transactionIndex, debugFrameResult, fields) {
    if (debugFrameResult.result.type == 'STOP') {
        (0, assert_1.default)(!debugFrameResult.result.calls?.length);
        return;
    }
    let projection = fields?.trace || {};
    for (let { traceAddress, subtraces, frame } of traverseDebugFrame(debugFrameResult.result, [])) {
        let trace;
        switch (frame.type) {
            case 'CREATE':
            case 'CREATE2': {
                trace = new entities_1.TraceCreate(header, transactionIndex, traceAddress);
                let action = {};
                action.from = frame.from;
                if (projection.createValue) {
                    action.value = frame.value;
                }
                if (projection.createGas) {
                    action.gas = frame.gas;
                }
                if (projection.createInit) {
                    action.init = frame.input;
                }
                if (!(0, schema_1.isEmpty)(action)) {
                    trace.action = action;
                }
                let result = {};
                if (projection.createResultGasUsed) {
                    result.gasUsed = frame.gasUsed;
                }
                if (projection.createResultCode) {
                    result.code = frame.output;
                }
                if (projection.createResultAddress) {
                    result.address = frame.to;
                }
                if (!(0, schema_1.isEmpty)(result)) {
                    trace.result = result;
                }
                break;
            }
            case 'CALL':
            case 'CALLCODE':
            case 'DELEGATECALL':
            case 'STATICCALL':
            case 'INVALID': {
                trace = new entities_1.TraceCall(header, transactionIndex, traceAddress);
                let action = {};
                let hasAction = false;
                if (projection.callCallType) {
                    action.callType = frame.type.toLowerCase();
                }
                if (projection.callFrom) {
                    action.from = frame.from;
                }
                action.to = frame.to;
                if (projection.callValue) {
                    hasAction = true;
                    if (frame.value != null) {
                        action.value = frame.value;
                    }
                }
                if (projection.callGas) {
                    action.gas = frame.gas;
                }
                if (projection.callInput) {
                    action.input = frame.input;
                }
                action.sighash = frame.input.slice(0, 10);
                if (hasAction || !(0, schema_1.isEmpty)(action)) {
                    trace.action = action;
                }
                let result = {};
                if (projection.callResultGasUsed) {
                    result.gasUsed = frame.gasUsed;
                }
                if (projection.callResultOutput) {
                    result.output = frame.output;
                }
                if (!(0, schema_1.isEmpty)(result)) {
                    trace.result = result;
                }
                break;
            }
            case 'SELFDESTRUCT': {
                trace = new entities_1.TraceSuicide(header, transactionIndex, traceAddress);
                let action = {};
                if (projection.suicideAddress) {
                    action.address = frame.from;
                }
                if (projection.suicideBalance) {
                    action.balance = frame.value;
                }
                action.refundAddress = frame.to;
                if (!(0, schema_1.isEmpty)(action)) {
                    trace.action = action;
                }
                break;
            }
            default:
                throw (0, util_internal_1.unexpectedCase)(frame.type);
        }
        if (projection.subtraces) {
            trace.subtraces = subtraces;
        }
        if (frame.error != null) {
            trace.error = frame.error;
        }
        if (frame.revertReason != null) {
            trace.revertReason = frame.revertReason;
        }
        yield trace;
    }
}
function* traverseDebugFrame(frame, traceAddress) {
    let subcalls = frame.calls || [];
    yield { traceAddress, subtraces: subcalls.length, frame };
    for (let i = 0; i < subcalls.length; i++) {
        yield* traverseDebugFrame(subcalls[i], [...traceAddress, i]);
    }
}
function* mapDebugStateDiff(header, transactionIndex, debugDiffResult) {
    if (debugDiffResult == null)
        return;
    let { pre, post } = debugDiffResult.result;
    for (let address in pre) {
        let prev = pre[address];
        let next = post[address] || {};
        yield* mapDebugStateMap(header, transactionIndex, address, prev, next);
    }
    for (let address in post) {
        if (pre[address] == null) {
            yield* mapDebugStateMap(header, transactionIndex, address, {}, post[address]);
        }
    }
}
function* mapDebugStateMap(header, transactionIndex, address, prev, next) {
    if (next.code) {
        yield makeDebugStateDiffRecord(header, transactionIndex, address, 'code', prev.code, next.code);
    }
    if (next.balance) {
        yield makeDebugStateDiffRecord(header, transactionIndex, address, 'balance', '0x' + (prev.balance || 0).toString(16), '0x' + next.balance.toString(16));
    }
    if (next.nonce) {
        yield makeDebugStateDiffRecord(header, transactionIndex, address, 'nonce', '0x' + (prev.nonce ?? 0).toString(16), '0x' + next.nonce.toString(16));
    }
    for (let key in prev.storage) {
        yield makeDebugStateDiffRecord(header, transactionIndex, address, key, prev.storage[key], next.storage?.[key]);
    }
    for (let key in next.storage) {
        if (prev.storage?.[key] == null) {
            yield makeDebugStateDiffRecord(header, transactionIndex, address, key, undefined, next.storage[key]);
        }
    }
}
function makeDebugStateDiffRecord(header, transactionIndex, address, key, prev, next) {
    if (prev == null) {
        let diff = new entities_1.StateDiffAdd(header, transactionIndex, address, key);
        diff.next = (0, util_internal_1.assertNotNull)(next);
        return diff;
    }
    if (next == null) {
        let diff = new entities_1.StateDiffDelete(header, transactionIndex, address, key);
        diff.prev = (0, util_internal_1.assertNotNull)(prev);
        return diff;
    }
    {
        let diff = new entities_1.StateDiffChange(header, transactionIndex, address, key);
        diff.prev = prev;
        diff.next = next;
        return diff;
    }
}
//# sourceMappingURL=mapping.js.map