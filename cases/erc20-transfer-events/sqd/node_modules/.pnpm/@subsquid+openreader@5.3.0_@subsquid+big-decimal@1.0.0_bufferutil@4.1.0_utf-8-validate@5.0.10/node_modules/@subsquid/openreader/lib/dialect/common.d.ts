import { GraphQLFieldConfigMap, GraphQLSchema } from 'graphql';
import { Model } from '../model';
import { Context } from '../context';
import { OrderBy, Where } from '../ir/args';
export declare enum Dialect {
    OpenCrud = "opencrud",
    TheGraph = "thegraph"
}
export interface SchemaBuilder {
    build(): GraphQLSchema;
}
export interface SchemaOptions {
    model: Model;
    subscriptions?: boolean;
}
export type GqlFieldMap = GraphQLFieldConfigMap<unknown, Context>;
export declare function mergeOrderBy(list: OrderBy[]): OrderBy;
export declare function toCondition(op: 'AND' | 'OR', operands: Where[]): Where | undefined;
//# sourceMappingURL=common.d.ts.map