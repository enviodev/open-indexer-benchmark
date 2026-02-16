"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeRelayConnectionCursor = decodeRelayConnectionCursor;
exports.encodeRelayConnectionCursor = encodeRelayConnectionCursor;
function decodeRelayConnectionCursor(cursor) {
    if (!/^\d+$/.test(cursor))
        return undefined;
    let val = parseInt(cursor, 10);
    if (Number.isSafeInteger(val) && val > 0)
        return val;
    return undefined;
}
function encodeRelayConnectionCursor(val) {
    return '' + val;
}
//# sourceMappingURL=connection.js.map