"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BigDecimalColumn = BigDecimalColumn;
const transformers_1 = require("../../transformers");
const Column_1 = require("./Column");
/**
 * BigDecimalColumn decorator is used to mark a specific class property as a `numeric` table column.
 * Column value is transformed to `BigDecimal` type.
 *
 * Arrays are not supported.
 */
function BigDecimalColumn(options) {
    return (0, Column_1.Column)('numeric', { ...options, transformer: transformers_1.bigdecimalTransformer });
}
//# sourceMappingURL=BigDecimalColumn.js.map