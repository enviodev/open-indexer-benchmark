"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_DIRECTIONS = void 0;
exports.getOrderByList = getOrderByList;
exports.parseOrderBy = parseOrderBy;
const assert_1 = __importDefault(require("assert"));
const model_tools_1 = require("../../model.tools");
const MAPPING_CACHE = new WeakMap();
function getOrderByList(model, typeName) {
    let cache = MAPPING_CACHE.get(model);
    if (cache == null) {
        cache = {};
        MAPPING_CACHE.set(model, cache);
    }
    if (cache[typeName])
        return cache[typeName];
    return (cache[typeName] = buildOrderByList(model, typeName, 2));
}
function buildOrderByList(model, typeName, depth) {
    if (depth <= 0)
        return new Set();
    let properties = (0, model_tools_1.getUniversalProperties)(model, typeName);
    let m = new Set();
    for (let key in properties) {
        let propType = properties[key].type;
        switch (propType.kind) {
            case 'scalar':
            case 'enum':
                if (propType.name != 'JSON') {
                    m.add(key);
                }
                break;
            case 'object':
            case 'union':
                for (let name of buildOrderByList(model, propType.name, depth - 1)) {
                    m.add(key + '__' + name);
                }
                break;
            case 'fk':
            case 'lookup':
                m.add(key);
                for (let name of buildOrderByList(model, propType.entity, depth - 1)) {
                    m.add(key + '__' + name);
                }
                break;
        }
    }
    return m;
}
exports.ORDER_DIRECTIONS = {
    asc: 'ASC',
    asc_nulls_first: 'ASC NULLS FIRST',
    asc_nulls_last: 'ASC NULLS LAST',
    desc: 'DESC',
    desc_nulls_first: 'DESC NULLS FIRST',
    desc_nulls_last: 'DESC NULLS LAST',
};
function parseOrderBy(model, typeName, input) {
    let list = getOrderByList(model, typeName);
    (0, assert_1.default)(list.has(input.orderBy));
    const sortOrder = input.direction ? exports.ORDER_DIRECTIONS[input.direction] : exports.ORDER_DIRECTIONS['asc'];
    (0, assert_1.default)(sortOrder);
    const keys = input.orderBy.split('__').reverse();
    const res = keys.reduce((res, key) => ({ [key]: res ?? sortOrder }), null);
    (0, assert_1.default)(res);
    return res;
}
//# sourceMappingURL=orderBy.js.map