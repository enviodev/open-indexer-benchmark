"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BytesColumn = BytesColumn;
const Column_1 = require("./Column");
/**
 * BytesColumn decorator is used to mark a specific class property as a `bytea` table column.
 * Column value is transformed to `Uint8Array` type.
 */
function BytesColumn(options) {
    return (0, Column_1.Column)('bytea', options);
}
//# sourceMappingURL=BytesColumn.js.map