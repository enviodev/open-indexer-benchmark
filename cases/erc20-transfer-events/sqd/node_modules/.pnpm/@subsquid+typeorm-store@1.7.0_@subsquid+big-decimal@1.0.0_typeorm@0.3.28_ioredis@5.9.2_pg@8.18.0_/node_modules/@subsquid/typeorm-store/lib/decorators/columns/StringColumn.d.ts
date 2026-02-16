import { ColumnCommonOptions } from './common';
export type StringColumnOptions = Pick<ColumnCommonOptions, 'name' | 'unique' | 'nullable' | 'default' | 'comment' | 'array'>;
/**
 * StringColumn decorator is used to mark a specific class property as a `text` table column.
 * Column value is transformed to `string` type.
 */
export declare function StringColumn(options?: StringColumnOptions): PropertyDecorator;
//# sourceMappingURL=StringColumn.d.ts.map