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
    build(): GraphQLSchema;
    private installListQuery;
    private installEntityById;
    private installRelayConnection;
    private whereIdInput;
    private pageInfoType;
    private normalizeEntityName;
}
//# sourceMappingURL=schema.d.ts.map