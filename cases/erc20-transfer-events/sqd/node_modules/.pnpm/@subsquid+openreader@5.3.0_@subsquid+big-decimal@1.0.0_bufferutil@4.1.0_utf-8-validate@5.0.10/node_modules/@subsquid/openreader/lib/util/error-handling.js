"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDocumentCtx = void 0;
exports.logGraphQLErrors = logGraphQLErrors;
const logger_1 = require("@subsquid/logger");
const util_internal_1 = require("@subsquid/util-internal");
const graphql_1 = require("graphql");
exports.getDocumentCtx = (0, util_internal_1.weakMemo)((args) => {
    return {
        graphqlOperationName: args.operationName || undefined,
        graphqlDocument: (0, graphql_1.print)(args.document),
        graphqlVariables: args.variableValues
    };
});
function logGraphQLErrors(log, args, errors) {
    if (!errors?.length)
        return;
    let level = 0;
    let graphqlErrors = errors.map(err => {
        level = Math.max(level, getErrorLevel(err));
        return {
            message: err.message,
            path: err.path?.join('.'),
            extensions: err.extensions,
            originalError: err.originalError
        };
    });
    if (log.level > level)
        return;
    log.write(level, {
        graphqlErrors,
        ...(0, exports.getDocumentCtx)(args)
    }, 'graphql query ended with errors');
}
function getErrorLevel(err) {
    if (err.__openreaderLogLevel)
        return err.__openreaderLogLevel;
    if (err.extensions?.code === 'BAD_USER_INPUT')
        return logger_1.LogLevel.WARN;
    return logger_1.LogLevel.ERROR;
}
//# sourceMappingURL=error-handling.js.map