import { ExecutionResult } from 'graphql-ws';
import { ExecutionArgs } from 'graphql/execution/execute';
export interface ExecuteOptions {
    maxRootFields?: number;
}
export declare function openreaderExecute(args: ExecutionArgs, options: ExecuteOptions): Promise<ExecutionResult>;
type SubscriptionResult = AsyncIterableIterator<ExecutionResult> | ExecutionResult;
export declare function openreaderSubscribe(args: ExecutionArgs): Promise<SubscriptionResult>;
export {};
//# sourceMappingURL=execute.d.ts.map