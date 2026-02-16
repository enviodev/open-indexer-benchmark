"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StringColumn = StringColumn;
const Column_1 = require("./Column");
/**
 * StringColumn decorator is used to mark a specific class property as a `text` table column.
 * Column value is transformed to `string` type.
 */
function StringColumn(options) {
    return (0, Column_1.Column)('text', options);
}
//# sourceMappingURL=StringColumn.js.map