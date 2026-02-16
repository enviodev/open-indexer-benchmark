/**
 * Column decorator is used to mark a specific class property as a table column.
 * Only properties decorated with this decorator will be persisted to the database when entity be saved.
 * Primary columns also creates a PRIMARY KEY for this column in a db.
 *
 * Only `id` property can be used as a primary column
 */
export declare function PrimaryColumn(): PropertyDecorator;
//# sourceMappingURL=PrimaryColumn.d.ts.map