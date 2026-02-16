"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.qty2Int = qty2Int;
exports.toQty = toQty;
exports.getTxHash = getTxHash;
const assert_1 = __importDefault(require("assert"));
function qty2Int(qty) {
    let i = parseInt(qty, 16);
    (0, assert_1.default)(Number.isSafeInteger(i));
    return i;
}
function toQty(i) {
    return '0x' + i.toString(16);
}
function getTxHash(tx) {
    if (typeof tx == 'string') {
        return tx;
    }
    else {
        return tx.hash;
    }
}
//# sourceMappingURL=util.js.map