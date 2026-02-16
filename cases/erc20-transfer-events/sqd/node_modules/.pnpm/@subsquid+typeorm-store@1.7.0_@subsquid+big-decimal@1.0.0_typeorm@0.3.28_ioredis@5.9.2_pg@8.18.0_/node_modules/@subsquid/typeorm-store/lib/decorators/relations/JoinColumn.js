"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JoinColumn = JoinColumn;
const typeorm_1 = require("typeorm");
/**
 * JoinColumn decorator used on one-to-one relations to specify owner side of relationship.
 * It also can be used on both one-to-one and many-to-one relations to specify custom column name
 * or custom referenced column.
 */
function JoinColumn(optionsOrOptionsArray) {
    return (0, typeorm_1.JoinColumn)(optionsOrOptionsArray);
}
//# sourceMappingURL=JoinColumn.js.map