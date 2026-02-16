import { ColumnCommonOptions } from './common';
export type IntColumnOptions = Pick<ColumnCommonOptions, 'name' | 'unique' | 'nullable' | 'default' | 'comment' | 'array'>;
/**
 * IntColumn decorator is used to mark a specific class property as a `int4` table column.
 * Column value is transformed to `number` type.
 */
export declare function IntColumn(options?: IntColumnOptions): PropertyDecorator;
//# sourceMappingURL=IntColumn.d.ts.map