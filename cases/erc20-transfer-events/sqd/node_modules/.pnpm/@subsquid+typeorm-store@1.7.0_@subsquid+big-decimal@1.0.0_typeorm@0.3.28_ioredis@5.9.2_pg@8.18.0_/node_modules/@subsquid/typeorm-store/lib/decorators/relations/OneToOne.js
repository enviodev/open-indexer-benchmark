"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneToOne = OneToOne;
const typeorm_1 = require("typeorm");
/**
 * One-to-one relation allows to create direct relation between two entities. Entity1 have only one Entity2.
 * Entity1 is an owner of the relationship, and storages Entity1 id on its own side.
 */
function OneToOne(typeFunctionOrTarget, inverseSideOrOptions, options) {
    return (0, typeorm_1.OneToOne)(typeFunctionOrTarget, inverseSideOrOptions, options);
}
//# sourceMappingURL=OneToOne.js.map