export interface Filter<T> {
    match(obj: T): boolean;
}
export declare class EntityFilter<T, R extends object> {
    private requests;
    present(): boolean;
    match(obj: T): R | undefined;
    mergeRelations(a: R | undefined, b: R): R;
    add(filter: Filter<T> | FilterBuilder<T>, relations: R): void;
}
export declare class FilterBuilder<T> {
    private filters;
    private never;
    propIn<P extends keyof T>(prop: P, values?: T[P][]): this;
    getIn<P>(get: (obj: T) => P, values?: P[]): this;
    matchAny<P>(test: (obj: T, value: P) => boolean, values?: P[]): this;
    isNever(): boolean;
    build(): Filter<T>;
}
//# sourceMappingURL=filter.d.ts.map