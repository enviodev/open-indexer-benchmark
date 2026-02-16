import { GraphQLSchema } from 'graphql';
import { SchemaOptions } from '../common';
export declare class SchemaBuilder {
    private options;
    private model;
    private types;
    private where;
    private orderBy;
    constructor(options: SchemaOptions);
    private get;
    private buildType;
    private buildObjectFields;
    private getPropType;
    private listArguments;
    private getWhere;
    private buildPropWhereFilters;
    private hasFilters;
    private getOrderBy;
    private getOrderDirection;
    build(): GraphQLSchema;
    private installListQuery;
    private installEntityQuery;
    private normalizeQueryName;
}
//# sourceMappingURL=schema.d.ts.map