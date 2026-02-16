"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bigdecimalTransformer = exports.floatTransformer = exports.bigintTransformer = void 0;
exports.bigintTransformer = {
    to(x) {
        return x?.toString();
    },
    from(s) {
        return s == null ? undefined : BigInt(s);
    },
};
exports.floatTransformer = {
    to(x) {
        return x?.toString();
    },
    from(s) {
        return s == null ? undefined : Number(s);
    },
};
const decimal = {
    get BigDecimal() {
        throw new Error('Package `@subsquid/big-decimal` is not installed');
    },
};
try {
    Object.defineProperty(decimal, 'BigDecimal', {
        value: require('@subsquid/big-decimal').BigDecimal,
    });
}
catch (e) { }
exports.bigdecimalTransformer = {
    to(x) {
        return x?.toString();
    },
    from(s) {
        return s == null ? undefined : decimal.BigDecimal(s);
    },
};
//# sourceMappingURL=transformers.js.map