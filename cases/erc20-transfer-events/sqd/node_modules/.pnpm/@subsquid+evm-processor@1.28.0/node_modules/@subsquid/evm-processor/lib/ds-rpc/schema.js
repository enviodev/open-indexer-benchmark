"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockValidator = void 0;
const util_internal_1 = require("@subsquid/util-internal");
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const schema_1 = require("../mapping/schema");
const rpc_data_1 = require("./rpc-data");
// Here we must be careful to include all fields,
// that can potentially be used in item filters
// (no matter what field selection is telling us to omit)
exports.getBlockValidator = (0, util_internal_1.weakMemo)((req) => {
    let Transaction = req.transactions
        ? (0, util_internal_validation_1.object)({
            ...(0, schema_1.getTxProps)(req.fields.transaction, false),
            hash: util_internal_validation_1.BYTES,
            input: util_internal_validation_1.BYTES,
            from: util_internal_validation_1.BYTES,
            to: (0, util_internal_validation_1.option)(util_internal_validation_1.BYTES),
        })
        : util_internal_validation_1.BYTES;
    let GetBlock = (0, util_internal_validation_1.object)({
        ...(0, schema_1.getBlockHeaderProps)(req.fields.block, false),
        transactions: (0, util_internal_validation_1.array)(Transaction)
    });
    let Log = (0, util_internal_validation_1.object)({
        ...(0, schema_1.getLogProps)({ ...req.fields.log, address: true, topics: true }, false),
        address: util_internal_validation_1.BYTES,
        topics: (0, util_internal_validation_1.array)(util_internal_validation_1.BYTES)
    });
    let Receipt = (0, util_internal_validation_1.object)({
        transactionIndex: util_internal_validation_1.SMALL_QTY,
        transactionHash: util_internal_validation_1.BYTES,
        ...(0, schema_1.getTxReceiptProps)(req.fields.transaction, false),
        logs: req.logList ? (0, util_internal_validation_1.array)(Log) : undefined
    });
    let TraceFrame = (0, schema_1.getTraceFrameValidator)(req.fields.trace, false);
    let DebugFrame = getDebugFrameValidator(req.fields.trace);
    return (0, util_internal_validation_1.object)({
        height: util_internal_validation_1.NAT,
        hash: util_internal_validation_1.BYTES,
        block: GetBlock,
        ...(0, schema_1.project)({
            logs: req.logs,
            receipts: req.receipts
        }, {
            logs: (0, util_internal_validation_1.array)(Log),
            receipts: (0, util_internal_validation_1.array)(Receipt)
        }),
        traceReplays: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)((0, util_internal_validation_1.object)({
            transactionHash: util_internal_validation_1.BYTES,
            trace: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)(TraceFrame)),
            stateDiff: (0, util_internal_validation_1.option)((0, util_internal_validation_1.record)(util_internal_validation_1.BYTES, rpc_data_1.TraceStateDiff))
        }))),
        debugFrames: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)((0, util_internal_validation_1.option)((0, util_internal_validation_1.object)({
            result: DebugFrame
        })))),
        debugStateDiffs: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)((0, util_internal_validation_1.option)(rpc_data_1.DebugStateDiffResult)))
    });
});
function getDebugFrameValidator(fields) {
    let Frame;
    let base = {
        type: util_internal_validation_1.STRING,
        calls: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)((0, util_internal_validation_1.ref)(() => Frame))),
        ...(0, schema_1.project)(fields, {
            error: (0, util_internal_validation_1.option)(util_internal_validation_1.STRING),
            revertReason: (0, util_internal_validation_1.option)(util_internal_validation_1.STRING),
        })
    };
    let Create = (0, util_internal_validation_1.object)({
        ...base,
        from: util_internal_validation_1.BYTES,
        ...(0, schema_1.project)({
            value: fields?.createValue,
            gas: fields?.createGas,
            input: fields?.createInit,
            gasUsed: fields?.createResultGasUsed,
            output: fields?.createResultCode,
            to: fields?.createResultAddress
        }, {
            value: util_internal_validation_1.QTY,
            gas: util_internal_validation_1.QTY,
            input: util_internal_validation_1.BYTES,
            gasUsed: util_internal_validation_1.QTY,
            output: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES),
            to: (0, util_internal_validation_1.withDefault)('0x0000000000000000000000000000000000000000', util_internal_validation_1.BYTES)
        })
    });
    let Call = (0, util_internal_validation_1.object)({
        ...base,
        to: (0, util_internal_validation_1.withDefault)('0x0000000000000000000000000000000000000000', util_internal_validation_1.BYTES),
        input: util_internal_validation_1.BYTES,
        ...(0, schema_1.project)({
            from: fields?.callFrom,
            value: fields?.callValue,
            gas: fields?.callGas,
            output: fields?.callResultOutput,
            gasUsed: fields?.callResultGasUsed
        }, {
            from: util_internal_validation_1.BYTES,
            value: (0, util_internal_validation_1.option)(util_internal_validation_1.QTY),
            gas: (0, util_internal_validation_1.withDefault)(0n, util_internal_validation_1.QTY),
            gasUsed: (0, util_internal_validation_1.withDefault)(0n, util_internal_validation_1.QTY),
            output: (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES)
        })
    });
    let Suicide = (0, util_internal_validation_1.object)({
        ...base,
        to: (0, util_internal_validation_1.withDefault)('0x0000000000000000000000000000000000000000', util_internal_validation_1.BYTES),
        ...(0, schema_1.project)({
            from: fields?.suicideAddress,
            value: fields?.suicideBalance
        }, {
            from: util_internal_validation_1.BYTES,
            value: util_internal_validation_1.QTY
        })
    });
    let Stop = (0, util_internal_validation_1.object)({
        ...base,
    });
    function getVariant(value) {
        if (typeof value != 'object' || !value)
            return new util_internal_validation_1.ValidationFailure(value, `{value} is not an object`);
        let tag = (0, util_internal_validation_1.cast)(util_internal_validation_1.STRING, value.type).toUpperCase();
        value.type = tag;
        switch (tag) {
            case 'CALL':
            case 'CALLCODE':
            case 'STATICCALL':
            case 'DELEGATECALL':
            case 'INVALID':
                return Call;
            case 'CREATE':
            case 'CREATE2':
                return Create;
            case 'SELFDESTRUCT':
                return Suicide;
            case 'STOP':
                return Stop;
        }
        let failure = new util_internal_validation_1.ValidationFailure(tag, `got {value}, but expected one of ["CALL","CALLCODE","STATICCALL","DELEGATECALL","INVALID","CREATE","CREATE2","SELFDESTRUCT","STOP"]`);
        failure.path.push('type');
        return failure;
    }
    Frame = {
        cast(value) {
            let variant = getVariant(value);
            if (variant instanceof util_internal_validation_1.ValidationFailure)
                return variant;
            return variant.cast(value);
        },
        validate(value) {
            let variant = getVariant(value);
            if (variant instanceof util_internal_validation_1.ValidationFailure)
                return variant;
            return variant.validate(value);
        },
        phantom() {
            throw new Error();
        }
    };
    return Frame;
}
//# sourceMappingURL=schema.js.map