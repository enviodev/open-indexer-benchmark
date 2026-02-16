import type { Model } from '../../model';
import { OrderBy, SortOrder } from '../../ir/args';
export type TheGraphOrderByValue = string;
export type TheGraph_OrderBy_List = ReadonlySet<TheGraphOrderByValue>;
export declare function getOrderByList(model: Model, typeName: string): TheGraph_OrderBy_List;
export declare const ORDER_DIRECTIONS: Record<string, SortOrder>;
export declare function parseOrderBy(model: Model, typeName: string, input: {
    orderBy: string;
    direction?: string;
}): OrderBy;
//# sourceMappingURL=orderBy.d.ts.map