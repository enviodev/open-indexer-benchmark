"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrimaryColumn = PrimaryColumn;
const assert_1 = __importDefault(require("assert"));
const typeorm_1 = require("typeorm");
/**
 * Column decorator is used to mark a specific class property as a table column.
 * Only properties decorated with this decorator will be persisted to the database when entity be saved.
 * Primary columns also creates a PRIMARY KEY for this column in a db.
 *
 * Only `id` property can be used as a primary column
 */
function PrimaryColumn() {
    return function (object, propertyName) {
        (0, assert_1.default)(propertyName === 'id', 'only "id" field can be used as a primary column');
        (0, typeorm_1.PrimaryColumn)()(object, propertyName);
    };
}
//# sourceMappingURL=PrimaryColumn.js.map