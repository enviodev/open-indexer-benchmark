"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneToMany = OneToMany;
const typeorm_1 = require("typeorm");
/**
 * A one-to-many relation allows creating the type of relation where Entity1 can have multiple instances of Entity2,
 * but Entity2 has only one Entity1. Entity2 is the owner of the relationship, and stores the id of Entity1 on its
 * side of the relation.
 */
function OneToMany(typeFunctionOrTarget, inverseSide, options) {
    return (0, typeorm_1.OneToMany)(typeFunctionOrTarget, inverseSide, options);
}
//# sourceMappingURL=OneToMany.js.map