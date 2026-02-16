export interface IndexOptions {
    /**
     * Indicates if this composite index must be unique or not.
     */
    unique?: boolean;
    /**
     * Index filter condition.
     */
    where?: string;
}
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(options?: IndexOptions): ClassDecorator & PropertyDecorator;
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(name: string, options?: IndexOptions): ClassDecorator & PropertyDecorator;
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(name: string, options: {
    synchronize: false;
}): ClassDecorator & PropertyDecorator;
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(name: string, fields: string[], options?: IndexOptions): ClassDecorator & PropertyDecorator;
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(fields: string[], options?: IndexOptions): ClassDecorator & PropertyDecorator;
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(fields: (object?: any) => any[] | {
    [key: string]: number;
}, options?: IndexOptions): ClassDecorator & PropertyDecorator;
/**
 * Creates a database index.
 * Can be used on entity property or on entity.
 * Can create indices with composite columns when used on entity.
 */
export declare function Index(name: string, fields: (object?: any) => any[] | {
    [key: string]: number;
}, options?: IndexOptions): ClassDecorator & PropertyDecorator;
//# sourceMappingURL=Index_.d.ts.map