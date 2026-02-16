import { ColumnCommonOptions } from './common';
export type BytesColumnOptions = Pick<ColumnCommonOptions, 'name' | 'unique' | 'nullable' | 'default' | 'comment' | 'array'>;
/**
 * BytesColumn decorator is used to mark a specific class property as a `bytea` table column.
 * Column value is transformed to `Uint8Array` type.
 */
export declare function BytesColumn(options?: BytesColumnOptions): PropertyDecorator;
//# sourceMappingURL=BytesColumn.d.ts.map