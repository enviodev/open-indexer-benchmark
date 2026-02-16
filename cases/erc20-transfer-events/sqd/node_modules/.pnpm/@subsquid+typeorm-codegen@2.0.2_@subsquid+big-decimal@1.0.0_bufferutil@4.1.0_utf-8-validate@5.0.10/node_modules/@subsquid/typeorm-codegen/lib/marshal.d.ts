export interface Marshal<T, S> {
    fromJSON(value: unknown): T;
    toJSON(value: T): S;
}
export declare const string: Marshal<string, string>;
export declare const id: Marshal<string, string>;
export declare const int: Marshal<number, number>;
export declare const float: Marshal<number, number>;
export declare const boolean: Marshal<boolean, boolean>;
export declare const bigint: Marshal<bigint, string>;
export declare const bigdecimal: Marshal<any, string>;
export declare const datetime: Marshal<Date, string>;
export declare const bytes: Marshal<Uint8Array, string>;
export declare function fromList<T>(list: unknown, f: (val: unknown) => T): T[];
export declare function nonNull<T>(val: T | undefined | null): T;
export declare function enumFromJson<E extends object>(json: unknown, enumObject: E): E[keyof E];
//# sourceMappingURL=marshal.d.ts.map