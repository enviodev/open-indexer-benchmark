import { Logger } from '@subsquid/logger';
import { ExecutionArgs, GraphQLError } from 'graphql';
export interface DocumentCtx {
    graphqlOperationName?: string;
    graphqlDocument: string;
    graphqlVariables: any;
}
export declare const getDocumentCtx: (obj: ExecutionArgs) => DocumentCtx;
export declare function logGraphQLErrors(log: Logger, args: ExecutionArgs, errors: readonly GraphQLError[] | undefined): void;
//# sourceMappingURL=error-handling.d.ts.map