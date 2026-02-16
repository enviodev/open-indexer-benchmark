"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaBuilder = void 0;
const util_internal_1 = require("@subsquid/util-internal");
const util_naming_1 = require("@subsquid/util-naming");
const assert_1 = __importDefault(require("assert"));
const graphql_1 = require("graphql");
const limit_size_1 = require("../../limit.size");
const model_tools_1 = require("../../model.tools");
const scalars_1 = require("../../scalars");
const query_1 = require("../../sql/query");
const resolve_tree_1 = require("../../util/resolve-tree");
const util_1 = require("../../util/util");
const orderBy_1 = require("./orderBy");
const tree_1 = require("./tree");
const locale_1 = require("./locale");
const GraphQLID = new graphql_1.GraphQLScalarType({
    name: 'ID',
    serialize: graphql_1.GraphQLString.serialize,
    parseValue: graphql_1.GraphQLString.parseValue,
    parseLiteral: function parseLiteral(valueNode) {
        if (valueNode.kind !== graphql_1.Kind.STRING) {
            throw new graphql_1.GraphQLError('ID cannot represent a non-string value: ' + valueNode, valueNode);
        }
        return valueNode.value;
    },
});
class SchemaBuilder {
    constructor(options) {
        this.options = options;
        this.types = new Map();
        this.where = new Map();
        this.orderBy = new Map();
        this.model = options.model;
    }
    get(name, kind) {
        switch (name) {
            case 'ID':
                return GraphQLID;
            case 'String':
                return graphql_1.GraphQLString;
            case 'Int':
                return graphql_1.GraphQLInt;
            case 'Boolean':
                return graphql_1.GraphQLBoolean;
            case 'Float':
                return graphql_1.GraphQLFloat;
            case 'DateTime':
                return scalars_1.customScalars.DateTime;
            case 'BigInt':
                return scalars_1.customScalars.BigInt;
            case 'BigDecimal':
                return scalars_1.customScalars.BigDecimal;
            case 'Bytes':
                return scalars_1.customScalars.Bytes;
            case 'JSON':
                return scalars_1.customScalars.JSON;
        }
        let type = this.types.get(name);
        if (type == null) {
            type = this.buildType(name);
            this.types.set(name, type);
        }
        if (kind) {
            (0, assert_1.default)(type instanceof kind);
        }
        return type;
    }
    buildType(name) {
        const item = this.model[name];
        switch (item.kind) {
            case 'entity':
            case 'object':
                return new graphql_1.GraphQLObjectType({
                    name,
                    description: item.description,
                    interfaces: () => item.interfaces?.map((name) => this.get(name, graphql_1.GraphQLInterfaceType)),
                    fields: () => this.buildObjectFields(item),
                });
            case 'interface':
                return new graphql_1.GraphQLInterfaceType({
                    name,
                    description: item.description,
                    fields: () => this.buildObjectFields(item),
                    resolveType: item.queryable ? (value) => value._isTypeOf : undefined,
                });
            case 'enum':
                return new graphql_1.GraphQLEnumType({
                    name,
                    description: item.description,
                    values: Object.keys(item.values).reduce((values, variant) => {
                        values[variant] = {};
                        return values;
                    }, {}),
                });
            case 'union':
                return new graphql_1.GraphQLUnionType({
                    name,
                    description: item.description,
                    types: () => item.variants.map((variant) => this.get(variant, graphql_1.GraphQLObjectType)),
                    resolveType(value) {
                        return value.isTypeOf;
                    },
                });
            default:
                throw (0, util_internal_1.unexpectedCase)();
        }
    }
    buildObjectFields(object) {
        let fields = {};
        for (let key in object.properties) {
            let prop = object.properties[key];
            let field = {
                description: prop.description,
                type: this.getPropType(prop),
            };
            if (prop.type.kind == 'list-lookup') {
                field.args = this.listArguments(prop.type.entity);
            }
            if (object.kind == 'entity' || object.kind == 'object') {
                switch (prop.type.kind) {
                    case 'object':
                    case 'union':
                    case 'fk':
                    case 'lookup':
                    case 'list-lookup':
                        field.resolve = (source, args, context, info) => source[info.path.key];
                        break;
                }
            }
            fields[key] = field;
        }
        return fields;
    }
    getPropType(prop) {
        let type;
        switch (prop.type.kind) {
            case 'list':
                type = new graphql_1.GraphQLList(this.getPropType(prop.type.item));
                break;
            case 'fk':
                type = this.get(prop.type.entity);
                break;
            case 'lookup':
                return this.get(prop.type.entity);
            case 'list-lookup':
                return new graphql_1.GraphQLNonNull(new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(this.get(prop.type.entity))));
            default:
                type = this.get(prop.type.name);
        }
        if (!prop.nullable) {
            type = new graphql_1.GraphQLNonNull(type);
        }
        return type;
    }
    listArguments(typeName) {
        return {
            where: { type: this.getWhere(typeName) },
            orderBy: { type: this.getOrderBy(typeName) },
            orderDirection: { type: this.getOrderDirection() },
            skip: { type: graphql_1.GraphQLInt },
            first: { type: graphql_1.GraphQLInt },
        };
    }
    getWhere(typeName) {
        let where = this.where.get(typeName);
        if (where)
            return where;
        let object = this.model[typeName];
        let properties = (0, model_tools_1.getUniversalProperties)(this.model, typeName);
        where = new graphql_1.GraphQLInputObjectType({
            name: `${typeName}_filter`,
            fields: () => {
                let fields = {};
                for (let key in properties) {
                    this.buildPropWhereFilters(key, properties[key], fields);
                }
                if (object.kind == 'entity' || object.kind == 'interface') {
                    let whereList = new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(this.getWhere(typeName)));
                    fields['and'] = {
                        type: whereList,
                    };
                    fields['or'] = {
                        type: whereList,
                    };
                }
                return fields;
            },
        });
        this.where.set(typeName, where);
        return where;
    }
    buildPropWhereFilters(key, prop, fields) {
        switch (prop.type.kind) {
            case 'scalar': {
                let type = this.get(prop.type.name, graphql_1.GraphQLScalarType);
                let listType = new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(type));
                fields[`${key}_is_null`] = { type: graphql_1.GraphQLBoolean };
                fields[`${key}`] = { type };
                fields[`${key}_not`] = { type };
                switch (prop.type.name) {
                    case 'ID':
                    case 'String':
                    case 'Int':
                    case 'Float':
                    case 'DateTime':
                    case 'BigInt':
                    case 'BigDecimal':
                        fields[`${key}_gt`] = { type };
                        fields[`${key}_gte`] = { type };
                        fields[`${key}_lt`] = { type };
                        fields[`${key}_lte`] = { type };
                        fields[`${key}_in`] = { type: listType };
                        fields[`${key}_not_in`] = { type: listType };
                        break;
                    case 'JSON':
                        fields[`${key}_json_contains`] = { type };
                        fields[`${key}_json_has_key`] = { type };
                        break;
                }
                if (prop.type.name == 'ID' || prop.type.name == 'String') {
                    fields[`${key}_contains`] = { type };
                    fields[`${key}_not_contains`] = { type };
                    fields[`${key}_contains_nocase`] = { type };
                    fields[`${key}_not_contains_nocase`] = { type };
                    fields[`${key}_starts_with`] = { type };
                    fields[`${key}_starts_with_nocase`] = { type };
                    fields[`${key}_not_starts_with`] = { type };
                    fields[`${key}_not_starts_with_nocase`] = { type };
                    fields[`${key}_ends_with`] = { type };
                    fields[`${key}_ends_with_nocase`] = { type };
                    fields[`${key}_not_ends_with`] = { type };
                    fields[`${key}_not_ends_with_nocase`] = { type };
                }
                break;
            }
            case 'enum': {
                let type = this.get(prop.type.name, graphql_1.GraphQLEnumType);
                let listType = new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(type));
                fields[`${key}_is_null`] = { type: graphql_1.GraphQLBoolean };
                fields[`${key}`] = { type };
                fields[`${key}_not`] = { type };
                fields[`${key}_in`] = { type: listType };
                fields[`${key}_not_in`] = { type: listType };
                break;
            }
            case 'list':
                fields[`${key}_isNull`] = { type: graphql_1.GraphQLBoolean };
                if (prop.type.item.type.kind == 'scalar' || prop.type.item.type.kind == 'enum') {
                    let item = this.getPropType(prop.type.item);
                    let list = new graphql_1.GraphQLList(item);
                    fields[`${key}_contains_all`] = { type: list };
                    fields[`${key}_contains_any`] = { type: list };
                    fields[`${key}_contains_none`] = { type: list };
                }
                break;
            case 'object':
                fields[`${key}_is_null`] = { type: graphql_1.GraphQLBoolean };
                if (this.hasFilters((0, model_tools_1.getObject)(this.model, prop.type.name))) {
                    fields[`${key}_`] = { type: this.getWhere(prop.type.name) };
                }
                break;
            case 'union':
                fields[`${key}_is_null`] = { type: graphql_1.GraphQLBoolean };
                fields[key] = { type: this.getWhere(prop.type.name) };
                break;
            case 'fk':
                // TODO: needs to be changed in case if we support non-string ids
                let type = graphql_1.GraphQLString;
                let listType = new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(type));
                fields[`${key}`] = { type };
                fields[`${key}_not`] = { type };
                fields[`${key}_gt`] = { type };
                fields[`${key}_gte`] = { type };
                fields[`${key}_lt`] = { type };
                fields[`${key}_lte`] = { type };
                fields[`${key}_in`] = { type: listType };
                fields[`${key}_not_in`] = { type: listType };
                fields[`${key}_contains`] = { type };
                fields[`${key}_not_contains`] = { type };
                fields[`${key}_contains_nocase`] = { type };
                fields[`${key}_not_contains_nocase`] = { type };
                fields[`${key}_starts_with`] = { type };
                fields[`${key}_starts_with_nocase`] = { type };
                fields[`${key}_not_starts_with`] = { type };
                fields[`${key}_not_starts_with_nocase`] = { type };
                fields[`${key}_ends_with`] = { type };
                fields[`${key}_ends_with_nocase`] = { type };
                fields[`${key}_not_ends_with`] = { type };
                fields[`${key}_not_ends_with_nocase`] = { type };
                fields[`${key}_is_null`] = { type: graphql_1.GraphQLBoolean };
                fields[`${key}_`] = { type: this.getWhere(prop.type.entity) };
                break;
            case 'lookup': {
                fields[`${key}_is_null`] = { type: graphql_1.GraphQLBoolean };
                fields[`${key}_`] = { type: this.getWhere(prop.type.entity) };
                break;
            }
            case 'list-lookup':
                let where = this.getWhere(prop.type.entity);
                fields[`${key}_every`] = { type: where };
                fields[`${key}_some`] = { type: where };
                fields[`${key}_none`] = { type: where };
                break;
        }
    }
    hasFilters(obj) {
        for (let key in obj.properties) {
            let propType = obj.properties[key].type;
            switch (propType.kind) {
                case 'scalar':
                case 'enum':
                case 'union':
                    return true;
                case 'object': {
                    let ref = (0, model_tools_1.getObject)(this.model, propType.name);
                    if (ref !== obj && this.hasFilters(ref)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    getOrderBy(typeName) {
        let orderBy = this.orderBy.get(typeName);
        if (orderBy)
            return orderBy;
        let values = {};
        for (let variant of (0, orderBy_1.getOrderByList)(this.model, typeName)) {
            values[variant] = {};
        }
        orderBy = new graphql_1.GraphQLEnumType({
            name: `${typeName}_orderBy`,
            values,
        });
        this.orderBy.set(typeName, orderBy);
        return orderBy;
    }
    getOrderDirection() {
        let values = {};
        for (let variant of Object.keys(orderBy_1.ORDER_DIRECTIONS)) {
            values[variant] = {};
        }
        return new graphql_1.GraphQLEnumType({
            name: `OrderDirection`,
            values,
        });
    }
    build() {
        let query = {};
        let subscription = {};
        for (let name in this.model) {
            let item = this.model[name];
            switch (item.kind) {
                case 'entity':
                    this.installEntityQuery(name, query, subscription);
                    this.installListQuery(name, query, subscription);
                    break;
                case 'interface':
                    if (item.queryable) {
                        this.installListQuery(name, query, subscription);
                    }
                    break;
            }
        }
        return new graphql_1.GraphQLSchema({
            query: new graphql_1.GraphQLObjectType({
                name: 'Query',
                fields: query,
            }),
            subscription: this.options.subscriptions
                ? new graphql_1.GraphQLObjectType({
                    name: 'Subscription',
                    fields: subscription,
                })
                : undefined,
        });
    }
    installListQuery(typeName, query, subscription) {
        let model = this.model;
        let entity = model[typeName];
        let queryName = (entity.kind === 'entity' && entity.listQueryName) || this.normalizeQueryName(typeName).plural;
        let outputType = new graphql_1.GraphQLNonNull(new graphql_1.GraphQLList(new graphql_1.GraphQLNonNull(this.get(typeName))));
        let argsType = this.listArguments(typeName);
        function createQuery(context, info, limit) {
            let tree = (0, resolve_tree_1.getResolveTree)(info);
            let args = (0, tree_1.parseSqlArguments)(model, typeName, tree.args);
            let fields = (0, tree_1.parseAnyTree)(model, typeName, info.schema, tree);
            limit?.check(() => (0, limit_size_1.getListSize)(model, typeName, fields, args.limit, args.where) + 1);
            return new query_1.ListQuery(model, context.openreader.dbType, typeName, fields, args);
        }
        query[queryName] = {
            type: outputType,
            args: argsType,
            resolve(source, args, context, info) {
                let q = createQuery(context, info, context.openreader.responseSizeLimit);
                return context.openreader.executeQuery(q);
            },
        };
        subscription[queryName] = {
            type: outputType,
            args: argsType,
            resolve: util_1.identity,
            subscribe(source, args, context, info) {
                let q = createQuery(context, info, context.openreader.subscriptionResponseSizeLimit);
                return context.openreader.subscription(q);
            },
        };
    }
    installEntityQuery(entityName, query, subscription) {
        let model = this.model;
        let entity = model[entityName];
        let queryName = (entity.kind === 'entity' && entity.queryName) || this.normalizeQueryName(entityName).singular;
        let argsType = {
            id: { type: new graphql_1.GraphQLNonNull(graphql_1.GraphQLString) },
        };
        function createQuery(context, info, limit) {
            let tree = (0, resolve_tree_1.getResolveTree)(info);
            let fields = (0, tree_1.parseObjectTree)(model, entityName, info.schema, tree);
            limit?.check(() => (0, limit_size_1.getObjectSize)(model, fields) + 1);
            return new query_1.EntityByIdQuery(model, context.openreader.dbType, entityName, fields, tree.args.id);
        }
        query[queryName] = {
            type: this.get(entityName),
            args: argsType,
            async resolve(source, args, context, info) {
                let q = createQuery(context, info, context.openreader.responseSizeLimit);
                return context.openreader.executeQuery(q);
            },
        };
        subscription[queryName] = {
            type: this.get(entityName),
            args: argsType,
            resolve: util_1.identity,
            subscribe(source, args, context, info) {
                let q = createQuery(context, info, context.openreader.subscriptionResponseSizeLimit);
                return context.openreader.subscription(q);
            },
        };
    }
    normalizeQueryName(typeName) {
        let singular = (0, util_naming_1.toCamelCase)(typeName);
        let plural = (0, locale_1.toPlural)(singular);
        if (singular === plural) {
            plural += '_collection';
        }
        return { singular, plural };
    }
}
exports.SchemaBuilder = SchemaBuilder;
__decorate([
    util_internal_1.def
], SchemaBuilder.prototype, "getOrderDirection", null);
__decorate([
    util_internal_1.def
], SchemaBuilder.prototype, "build", null);
//# sourceMappingURL=schema.js.map