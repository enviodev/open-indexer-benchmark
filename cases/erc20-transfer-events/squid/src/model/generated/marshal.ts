import assert from "assert"

export const bigintTransformer = {
    to(x?: bigint) {
        return x?.toString()
    },
    from(s?: string): bigint | undefined {
        return s == null ? undefined : BigInt(s)
    },
}

export const floatTransformer = {
    to(x?: number) {
        return x?.toString()
    },
    from(s?: string): number | undefined {
        return s == null ? undefined : Number(s)
    },
}

export const bigdecimalTransformer = {
    to(x?: any) {
        return x?.toString()
    },
    from(s?: string): any | undefined {
        return s == null ? undefined : s
    },
}

export function fromList<T>(list: any[] | undefined | null, f: (val: any) => T): T[] | undefined {
    return list == null ? undefined : list.map((val) => f(val))
}

export function toList<T>(list: T[] | undefined | null, f: (val: T) => any): any[] | undefined {
    return list == null ? undefined : list.map((val) => f(val))
}

export function nonNull<T>(val: T | undefined | null): T {
    assert(val != null, "non-nullable value is null")
    return val
}
