"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dialect = void 0;
exports.mergeOrderBy = mergeOrderBy;
exports.toCondition = toCondition;
const assert_1 = __importDefault(require("assert"));
var Dialect;
(function (Dialect) {
    Dialect["OpenCrud"] = "opencrud";
    Dialect["TheGraph"] = "thegraph";
})(Dialect || (exports.Dialect = Dialect = {}));
function mergeOrderBy(list) {
    let result = {};
    list.forEach((item) => {
        for (let key in item) {
            let current = result[key];
            if (current == null) {
                result[key] = item[key];
            }
            else if (typeof current != 'string') {
                let it = item[key];
                (0, assert_1.default)(typeof it == 'object');
                result[key] = mergeOrderBy([current, it]);
            }
        }
    });
    return result;
}
function toCondition(op, operands) {
    switch (operands.length) {
        case 0:
            return undefined;
        case 1:
            return operands[0];
        default:
            return { op, args: operands };
    }
}
//# sourceMappingURL=common.js.map