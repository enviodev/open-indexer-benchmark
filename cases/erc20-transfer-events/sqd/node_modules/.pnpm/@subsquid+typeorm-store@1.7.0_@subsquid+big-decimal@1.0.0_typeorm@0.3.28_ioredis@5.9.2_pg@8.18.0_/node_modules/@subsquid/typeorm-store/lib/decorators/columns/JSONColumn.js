"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONColumn = JSONColumn;
const Column_1 = require("./Column");
/**
 * JSONColumn decorator is used to mark a specific class property as a `jsonb` table column.
 * Column value is transformed to `unknown` type.
 */
function JSONColumn(options) {
    return (0, Column_1.Column)('jsonb', options);
}
//# sourceMappingURL=JSONColumn.js.map