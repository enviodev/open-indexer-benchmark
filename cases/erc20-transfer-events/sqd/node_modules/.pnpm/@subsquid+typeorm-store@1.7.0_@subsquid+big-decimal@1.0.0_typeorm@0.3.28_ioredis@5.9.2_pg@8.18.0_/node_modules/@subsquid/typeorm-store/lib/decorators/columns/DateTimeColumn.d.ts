import { ColumnCommonOptions } from './common';
export type DateTimeColumnOptions = Pick<ColumnCommonOptions, 'name' | 'unique' | 'nullable' | 'default' | 'comment' | 'array'>;
/**
 * DateTimeColumn decorator is used to mark a specific class property as a `timestamp with time zone` table column.
 * Column value is transformed to `Date` type.
 */
export declare function DateTimeColumn(options?: DateTimeColumnOptions): PropertyDecorator;
//# sourceMappingURL=DateTimeColumn.d.ts.map