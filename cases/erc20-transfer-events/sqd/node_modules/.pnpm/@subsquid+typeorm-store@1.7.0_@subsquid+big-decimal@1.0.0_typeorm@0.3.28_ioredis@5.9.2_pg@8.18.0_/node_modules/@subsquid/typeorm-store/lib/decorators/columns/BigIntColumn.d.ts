import { ColumnCommonOptions } from './common';
export type BigIntColumnOptions = Pick<ColumnCommonOptions, 'name' | 'unique' | 'nullable' | 'default' | 'comment'>;
/**
 * BigIntColumn decorator is used to mark a specific class property as a `numeric` table column.
 * Column value is transformed to `bigint` type.
 *
 * Arrays are not supported.
 */
export declare function BigIntColumn(options?: BigIntColumnOptions): PropertyDecorator;
//# sourceMappingURL=BigIntColumn.d.ts.map