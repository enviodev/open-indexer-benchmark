"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseWhere = parseWhere;
exports.parseWhereKey = parseWhereKey;
const util_internal_1 = require("@subsquid/util-internal");
const assert_1 = __importDefault(require("assert"));
const util_1 = require("../../util/util");
const common_1 = require("../common");
function parseWhere(whereArg) {
    if (whereArg == null)
        return undefined;
    let { and, or, ...fields } = whereArg;
    let conj = [];
    for (let key in fields) {
        let arg = fields[key];
        let { field, op } = parseWhereKey(key);
        switch (op) {
            case 'EQ':
                if (arg === null) {
                    conj.push({ op: 'isNull', field, yes: true });
                }
                else {
                    conj.push({ op: 'eq', field, value: arg });
                }
                break;
            case '_': {
                if (arg === null) {
                    conj.push({ op: 'isNull', field, yes: true });
                }
                else {
                    let where = parseWhere(arg);
                    where && conj.push({ op: 'REF', field, where });
                }
                break;
            }
            case '_every': {
                let where = parseWhere(arg);
                where && conj.push({ op: 'every', field, where });
                break;
            }
            case '_some':
                conj.push({ op: 'some', field, where: parseWhere(arg) });
                break;
            case '_none':
                conj.push({ op: 'none', field, where: parseWhere(arg) });
                break;
            case '_in':
                conj.push({ op: 'in', field, values: (0, util_1.ensureArray)(arg) });
                break;
            case '_not_in':
                conj.push({ op: 'not_in', field, values: (0, util_1.ensureArray)(arg) });
                break;
            case '_not':
                conj.push({ op: 'not_eq', field, value: arg });
                break;
            case '_gt':
                conj.push({ op: 'gt', field, value: arg });
                break;
            case '_gte':
                conj.push({ op: 'gte', field, value: arg });
                break;
            case '_lt':
                conj.push({ op: 'lt', field, value: arg });
                break;
            case '_lte':
                conj.push({ op: 'lte', field, value: arg });
                break;
            case '_contains':
                conj.push({ op: 'contains', field, value: arg });
                break;
            case '_not_contains':
                conj.push({ op: 'not_contains', field, value: arg });
                break;
            case '_contains_nocase':
                conj.push({ op: 'containsInsensitive', field, value: arg });
                break;
            case '_not_contains_nocase':
                conj.push({ op: 'not_containsInsensitive', field, value: arg });
                break;
            case '_starts_with':
                conj.push({ op: 'startsWith', field, value: arg });
                break;
            case '_starts_with_nocase':
                conj.push({ op: 'startsWithInsensitive', field, value: arg });
                break;
            case '_not_starts_with':
                conj.push({ op: 'not_startsWith', field, value: arg });
                break;
            case '_not_starts_with_nocase':
                conj.push({ op: 'not_startsWithInsensitive', field, value: arg });
                break;
            case '_ends_with':
                conj.push({ op: 'endsWith', field, value: arg });
                break;
            case '_ends_with_nocase':
                conj.push({ op: 'endsWithInsensitive', field, value: arg });
                break;
            case '_not_ends_with':
                conj.push({ op: 'not_endsWith', field, value: arg });
                break;
            case '_not_ends_with_nocase':
                conj.push({ op: 'not_endsWithInsensitive', field, value: arg });
                break;
            case '_json_has_key':
                conj.push({ op: 'jsonHasKey', field, value: arg });
                break;
            case '_json_contains':
                conj.push({ op: 'jsonContains', field, value: arg });
                break;
            case '_contains_none':
                conj.push({ op: 'containsNone', field, value: (0, util_1.ensureArray)(arg) });
                break;
            case '_contains_all':
                conj.push({ op: 'containsAll', field, value: (0, util_1.ensureArray)(arg) });
                break;
            case '_contains_any':
                conj.push({ op: 'containsAny', field, value: (0, util_1.ensureArray)(arg) });
                break;
            case '_is_null':
                (0, assert_1.default)(typeof arg == 'boolean');
                conj.push({ op: 'isNull', field, yes: arg });
                break;
            default:
                throw (0, util_internal_1.unexpectedCase)(op);
        }
    }
    if (and) {
        for (let arg of (0, util_1.ensureArray)(and)) {
            let where = parseWhere(arg);
            if (where) {
                conj.push(where);
            }
        }
    }
    let conjunction = (0, common_1.toCondition)('AND', conj);
    if (or) {
        let disjunctions = [];
        if (conjunction) {
            disjunctions.push(conjunction);
        }
        for (let arg of (0, util_1.ensureArray)(or)) {
            let where = parseWhere(arg);
            if (where) {
                disjunctions.push(where);
            }
        }
        return (0, common_1.toCondition)('OR', disjunctions);
    }
    else {
        return conjunction;
    }
}
function parseWhereKey(key) {
    let m = WHERE_KEY_REGEX.exec(key);
    if (m) {
        return { op: m[2], field: m[1] };
    }
    else {
        return { op: 'EQ', field: key };
    }
}
const WHERE_OPS = [
    '_',
    '_not',
    '_gt',
    '_gte',
    '_lt',
    '_lte',
    '_in',
    '_not_in',
    '_contains',
    '_contains_nocase',
    '_not_contains',
    '_not_contains_nocase',
    '_starts_with',
    '_starts_with_nocase',
    '_not_starts_with',
    '_not_starts_with_nocase',
    '_ends_with',
    '_ends_with_nocase',
    '_not_ends_with',
    '_not_ends_with_nocase',
    '_contains_all',
    '_contains_any',
    '_contains_none',
    '_json_contains',
    '_json_has_key',
    '_is_null',
    '_some',
    '_every',
    '_none',
];
const WHERE_KEY_REGEX = new RegExp(`^([^_]*)(${WHERE_OPS.join('|')})$`);
//# sourceMappingURL=where.js.map