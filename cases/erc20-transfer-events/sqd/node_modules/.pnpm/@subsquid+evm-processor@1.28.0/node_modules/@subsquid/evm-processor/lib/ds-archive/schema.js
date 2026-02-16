"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockValidator = void 0;
const util_internal_1 = require("@subsquid/util-internal");
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const schema_1 = require("../mapping/schema");
exports.getBlockValidator = (0, util_internal_1.weakMemo)((fields) => {
    let BlockHeader = (0, util_internal_validation_1.object)((0, schema_1.getBlockHeaderProps)(fields.block, true));
    let Transaction = (0, util_internal_validation_1.object)({
        hash: fields.transaction?.hash ? util_internal_validation_1.BYTES : undefined,
        ...(0, schema_1.getTxProps)(fields.transaction, true),
        sighash: fields.transaction?.sighash ? (0, util_internal_validation_1.withDefault)('0x', util_internal_validation_1.BYTES) : undefined,
        ...(0, schema_1.getTxReceiptProps)(fields.transaction, true)
    });
    let Log = (0, util_internal_validation_1.object)((0, schema_1.getLogProps)(fields.log, true));
    let Trace = (0, schema_1.getTraceFrameValidator)(fields.trace, true);
    let stateDiffBase = {
        transactionIndex: util_internal_validation_1.NAT,
        address: util_internal_validation_1.BYTES,
        key: util_internal_validation_1.STRING
    };
    let StateDiff = (0, util_internal_validation_1.taggedUnion)('kind', {
        ['=']: (0, util_internal_validation_1.object)({ ...stateDiffBase }),
        ['+']: (0, util_internal_validation_1.object)({ ...stateDiffBase, ...(0, schema_1.project)(fields.stateDiff, { next: util_internal_validation_1.BYTES }) }),
        ['*']: (0, util_internal_validation_1.object)({ ...stateDiffBase, ...(0, schema_1.project)(fields.stateDiff, { prev: util_internal_validation_1.BYTES, next: util_internal_validation_1.BYTES }) }),
        ['-']: (0, util_internal_validation_1.object)({ ...stateDiffBase, ...(0, schema_1.project)(fields.stateDiff, { prev: util_internal_validation_1.BYTES }) })
    });
    return (0, util_internal_validation_1.object)({
        header: BlockHeader,
        transactions: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)(Transaction)),
        logs: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)(Log)),
        traces: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)(Trace)),
        stateDiffs: (0, util_internal_validation_1.option)((0, util_internal_validation_1.array)(StateDiff))
    });
});
//# sourceMappingURL=schema.js.map