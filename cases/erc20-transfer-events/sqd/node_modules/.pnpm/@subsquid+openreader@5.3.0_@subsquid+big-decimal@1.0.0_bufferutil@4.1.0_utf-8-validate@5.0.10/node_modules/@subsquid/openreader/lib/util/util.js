"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toColumn = toColumn;
exports.toFkColumn = toFkColumn;
exports.toTable = toTable;
exports.ensureArray = ensureArray;
exports.toSafeInteger = toSafeInteger;
exports.invalidFormat = invalidFormat;
exports.identity = identity;
const util_naming_1 = require("@subsquid/util-naming");
const assert_1 = __importDefault(require("assert"));
function toColumn(gqlFieldName) {
    return (0, util_naming_1.toSnakeCase)(gqlFieldName);
}
function toFkColumn(gqlFieldName) {
    return (0, util_naming_1.toSnakeCase)(gqlFieldName) + '_id';
}
function toTable(entityName) {
    return (0, util_naming_1.toSnakeCase)(entityName);
}
function ensureArray(item) {
    return Array.isArray(item) ? item : [item];
}
function toSafeInteger(s) {
    let i = parseInt(s, 10);
    (0, assert_1.default)(Number.isSafeInteger(i));
    return i;
}
function invalidFormat(type, value) {
    return new TypeError(`Not a ${type}: ${value}`);
}
function identity(x) {
    return x;
}
//# sourceMappingURL=util.js.map