"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Entity = Entity;
const typeorm_1 = require("typeorm");
/**
 * This decorator is used to mark classes that will be an entity (table or document depend on database type).
 * Database schema will be created for all classes decorated with it, and Repository can be retrieved and used for it.
 */
function Entity(nameOrOptions, maybeOptions) {
    return (0, typeorm_1.Entity)(nameOrOptions, maybeOptions);
}
//# sourceMappingURL=Entity.js.map