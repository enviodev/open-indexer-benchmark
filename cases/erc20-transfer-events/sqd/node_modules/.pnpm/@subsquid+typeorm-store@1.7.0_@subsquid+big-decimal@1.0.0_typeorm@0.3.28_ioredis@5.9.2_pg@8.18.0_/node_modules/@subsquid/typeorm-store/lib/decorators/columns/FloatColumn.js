"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FloatColumn = FloatColumn;
const transformers_1 = require("../../transformers");
const Column_1 = require("./Column");
/**
 * FloatColumn decorator is used to mark a specific class property as a `numeric` table column.
 * Column value is transformed to `number` type.
 *
 * Arrays are not supported.
 */
function FloatColumn(options) {
    return (0, Column_1.Column)('numeric', { ...options, transformer: transformers_1.floatTransformer });
}
//# sourceMappingURL=FloatColumn.js.map