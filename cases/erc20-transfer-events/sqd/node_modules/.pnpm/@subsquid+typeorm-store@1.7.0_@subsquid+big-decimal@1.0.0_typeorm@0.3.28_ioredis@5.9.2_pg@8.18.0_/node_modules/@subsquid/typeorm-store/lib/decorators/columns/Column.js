"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Column = Column;
const typeorm_1 = require("typeorm");
/**
 * Column decorator is used to mark a specific class property as a table column.
 * Only properties decorated with this decorator will be persisted to the database when entity be saved.
 */
function Column(typeOrOptions, options) {
    return (0, typeorm_1.Column)(typeOrOptions, options);
}
//# sourceMappingURL=Column.js.map