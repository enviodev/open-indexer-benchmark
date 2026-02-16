"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManyToOne = ManyToOne;
const typeorm_1 = require("typeorm");
/**
 * A many-to-one relation allows creating the type of relation where Entity1 can have a single instance of Entity2, but
 * Entity2 can have multiple instances of Entity1. Entity1 is the owner of the relationship, and stores the id of
 * Entity2 on its side of the relation.
 */
function ManyToOne(typeFunctionOrTarget, inverseSideOrOptions, options) {
    return (0, typeorm_1.ManyToOne)(typeFunctionOrTarget, inverseSideOrOptions, options);
}
//# sourceMappingURL=ManyToOne.js.map