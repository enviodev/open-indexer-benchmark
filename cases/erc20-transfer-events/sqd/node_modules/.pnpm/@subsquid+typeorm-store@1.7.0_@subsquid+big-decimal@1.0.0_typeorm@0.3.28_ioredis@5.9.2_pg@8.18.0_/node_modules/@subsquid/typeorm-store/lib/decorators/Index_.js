"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Index = Index;
const typeorm_1 = require("typeorm");
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
function Index(nameOrFieldsOrOptions, maybeFieldsOrOptions, maybeOptions) {
    return (0, typeorm_1.Index)(nameOrFieldsOrOptions, maybeFieldsOrOptions, maybeOptions);
}
//# sourceMappingURL=Index_.js.map