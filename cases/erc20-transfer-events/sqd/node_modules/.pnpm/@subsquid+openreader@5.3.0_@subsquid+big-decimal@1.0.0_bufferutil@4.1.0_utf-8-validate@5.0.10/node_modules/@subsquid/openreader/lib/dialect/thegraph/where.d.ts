import { Where } from '../../ir/args';
export declare function parseWhere(whereArg?: any): Where | undefined;
export declare function parseWhereKey(key: string): {
    op: (typeof WHERE_OPS)[number] | 'EQ';
    field: string;
};
declare const WHERE_OPS: readonly ["_", "_not", "_gt", "_gte", "_lt", "_lte", "_in", "_not_in", "_contains", "_contains_nocase", "_not_contains", "_not_contains_nocase", "_starts_with", "_starts_with_nocase", "_not_starts_with", "_not_starts_with_nocase", "_ends_with", "_ends_with_nocase", "_not_ends_with", "_not_ends_with_nocase", "_contains_all", "_contains_any", "_contains_none", "_json_contains", "_json_has_key", "_is_null", "_some", "_every", "_none"];
export {};
//# sourceMappingURL=where.d.ts.map