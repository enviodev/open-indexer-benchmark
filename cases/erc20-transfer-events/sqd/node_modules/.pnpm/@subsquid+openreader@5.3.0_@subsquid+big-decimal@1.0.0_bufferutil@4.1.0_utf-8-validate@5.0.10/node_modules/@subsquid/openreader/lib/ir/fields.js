"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asEntityFields = asEntityFields;
exports.asQueryableFields = asQueryableFields;
const assert_1 = __importDefault(require("assert"));
function asEntityFields(fields) {
    (0, assert_1.default)(Array.isArray(fields));
    return fields;
}
function asQueryableFields(fields) {
    (0, assert_1.default)(!Array.isArray(fields));
    return fields;
}
//# sourceMappingURL=fields.js.map