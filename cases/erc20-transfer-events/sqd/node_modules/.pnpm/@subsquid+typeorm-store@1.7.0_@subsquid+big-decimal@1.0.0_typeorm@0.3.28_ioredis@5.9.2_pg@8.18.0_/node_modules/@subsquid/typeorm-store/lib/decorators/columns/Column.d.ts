import { SimpleColumnType, WithLengthColumnType, WithPrecisionColumnType } from 'typeorm/driver/types/ColumnTypes';
import { ColumnCommonOptions, ColumnNumericOptions, ColumnWithLengthOptions } from './common';
/**
 * Column decorator is used to mark a specific class property as a table column. Only properties decorated with this
 * decorator will be persisted to the database when entity be saved.
 */
export declare function Column(): PropertyDecorator;
/**
 * Column decorator is used to mark a specific class property as a table column.
 * Only properties decorated with this decorator will be persisted to the database when entity be saved.
 */
export declare function Column(type: SimpleColumnType, options?: ColumnCommonOptions): PropertyDecorator;
/**
 * Column decorator is used to mark a specific class property as a table column.
 * Only properties decorated with this decorator will be persisted to the database when entity be saved.
 */
export declare function Column(type: WithLengthColumnType, options?: ColumnCommonOptions & ColumnWithLengthOptions): PropertyDecorator;
/**
 * Column decorator is used to mark a specific class property as a table column.
 * Only properties decorated with this decorator will be persisted to the database when entity be saved.
 */
export declare function Column(type: WithPrecisionColumnType, options?: ColumnCommonOptions & ColumnNumericOptions): PropertyDecorator;
//# sourceMappingURL=Column.d.ts.map