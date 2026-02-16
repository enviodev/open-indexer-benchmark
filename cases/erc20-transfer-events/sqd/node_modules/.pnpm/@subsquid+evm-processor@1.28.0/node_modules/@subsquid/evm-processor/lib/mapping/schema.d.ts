import { FieldSelection } from '../interfaces/data';
export declare function getBlockHeaderProps(fields: FieldSelection['block'], forArchive: boolean): {
    nonce?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    sha3Uncles?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    logsBloom?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    transactionsRoot?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    stateRoot?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    receiptsRoot?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    mixHash?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    miner?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    difficulty?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    totalDifficulty?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    extraData?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    size?: import("@subsquid/util-internal-validation").Validator<number, string | number | null | undefined> | undefined;
    gasLimit?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    gasUsed?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    baseFeePerGas?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    timestamp?: import("@subsquid/util-internal-validation").Validator<number, string | number | null | undefined> | undefined;
    l1BlockNumber?: import("@subsquid/util-internal-validation").Validator<number, string | number | null | undefined> | undefined;
    number: import("@subsquid/util-internal-validation").Validator<number, number> | import("@subsquid/util-internal-validation").Validator<number, string>;
    hash: import("@subsquid/util-internal-validation").Validator<string, string>;
    parentHash: import("@subsquid/util-internal-validation").Validator<string, string>;
};
export declare function getTxProps(fields: FieldSelection['transaction'], forArchive: boolean): {
    hash?: import("@subsquid/util-internal-validation").Validator<string, string> | undefined;
    from?: import("@subsquid/util-internal-validation").Validator<string, string> | undefined;
    to?: import("@subsquid/util-internal-validation").Validator<string | undefined, string | null | undefined> | undefined;
    gas?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    gasPrice?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    maxFeePerGas?: import("@subsquid/util-internal-validation").Validator<bigint | undefined, string | null | undefined> | undefined;
    maxPriorityFeePerGas?: import("@subsquid/util-internal-validation").Validator<bigint | undefined, string | null | undefined> | undefined;
    input?: import("@subsquid/util-internal-validation").Validator<string, string> | undefined;
    nonce?: import("@subsquid/util-internal-validation").Validator<number, string | number | null | undefined> | undefined;
    value?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    v?: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined> | undefined;
    r?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    s?: import("@subsquid/util-internal-validation").Validator<string, string | null | undefined> | undefined;
    yParity?: import("@subsquid/util-internal-validation").Validator<number | undefined, string | number | null | undefined> | undefined;
    chainId?: import("@subsquid/util-internal-validation").Validator<number | undefined, string | number | null | undefined> | undefined;
    authorizationList?: import("@subsquid/util-internal-validation").Validator<{
        chainId: number;
        nonce: number;
        address: string;
        yParity: number;
        r: string;
        s: string;
    }[] | undefined, {
        chainId: string | number;
        nonce: string | number;
        address: string;
        yParity: string | number;
        r: string;
        s: string;
    }[] | null | undefined> | undefined;
    transactionIndex: import("@subsquid/util-internal-validation").Validator<number, number> | import("@subsquid/util-internal-validation").Validator<number, string>;
};
export declare function getTxReceiptProps(fields: FieldSelection['transaction'], forArchive: boolean): Partial<{
    gasUsed: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined>;
    cumulativeGasUsed: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined>;
    effectiveGasPrice: import("@subsquid/util-internal-validation").Validator<bigint, string | null | undefined>;
    contractAddress: import("@subsquid/util-internal-validation").Validator<string | undefined, string | null | undefined>;
    type: import("@subsquid/util-internal-validation").Validator<number, string | number | null | undefined>;
    status: import("@subsquid/util-internal-validation").Validator<number, string | number | null | undefined>;
    l1Fee: import("@subsquid/util-internal-validation").Validator<bigint | undefined, string | null | undefined>;
    l1FeeScalar: import("@subsquid/util-internal-validation").Validator<number | undefined, string | null | undefined>;
    l1GasPrice: import("@subsquid/util-internal-validation").Validator<bigint | undefined, string | null | undefined>;
    l1GasUsed: import("@subsquid/util-internal-validation").Validator<bigint | undefined, string | null | undefined>;
    l1BlobBaseFee: import("@subsquid/util-internal-validation").Validator<bigint | undefined, string | null | undefined>;
    l1BlobBaseFeeScalar: import("@subsquid/util-internal-validation").Validator<number | undefined, string | number | null | undefined>;
    l1BaseFeeScalar: import("@subsquid/util-internal-validation").Validator<number | undefined, string | number | null | undefined>;
}>;
export declare function getLogProps(fields: FieldSelection['log'], forArchive: boolean): {
    transactionHash?: import("@subsquid/util-internal-validation").Validator<string, string> | undefined;
    address?: import("@subsquid/util-internal-validation").Validator<string, string> | undefined;
    data?: import("@subsquid/util-internal-validation").Validator<string, string> | undefined;
    topics?: import("@subsquid/util-internal-validation").Validator<string[], string[]> | undefined;
    logIndex: import("@subsquid/util-internal-validation").Validator<number, number> | import("@subsquid/util-internal-validation").Validator<number, string>;
    transactionIndex: import("@subsquid/util-internal-validation").Validator<number, number> | import("@subsquid/util-internal-validation").Validator<number, string>;
};
export declare function getTraceFrameValidator(fields: FieldSelection['trace'], forArchive: boolean): import("@subsquid/util-internal-validation").Validator<{
    traceAddress: number[];
    action?: {
        from?: string | undefined;
        value?: bigint | undefined;
        gas?: bigint | undefined;
        init?: string | undefined;
    } | undefined;
    result?: {
        gasUsed?: bigint | undefined;
        code?: string | undefined;
        address?: string | undefined;
    } | undefined;
    subtraces?: number | undefined;
    error?: string | undefined;
    revertReason?: string | undefined;
    transactionIndex?: number | undefined;
    type: "create";
} | {
    traceAddress: number[];
    action?: {
        callType?: string | undefined;
        from?: string | undefined;
        to?: string | undefined;
        value?: bigint | undefined;
        gas?: bigint | undefined;
        input?: string | undefined;
        sighash?: string | undefined;
    } | undefined;
    result?: {
        gasUsed?: bigint | undefined;
        output?: string | undefined;
    } | undefined;
    subtraces?: number | undefined;
    error?: string | undefined;
    revertReason?: string | undefined;
    transactionIndex?: number | undefined;
    type: "call";
} | {
    traceAddress: number[];
    action?: {
        address?: string | undefined;
        refundAddress?: string | undefined;
        balance?: bigint | undefined;
    } | undefined;
    subtraces?: number | undefined;
    error?: string | undefined;
    revertReason?: string | undefined;
    transactionIndex?: number | undefined;
    type: "suicide";
} | {
    traceAddress: number[];
    action?: {
        author?: string | undefined;
        value?: bigint | undefined;
        type?: string | undefined;
    } | undefined;
    subtraces?: number | undefined;
    error?: string | undefined;
    revertReason?: string | undefined;
    transactionIndex?: number | undefined;
    type: "reward";
}, {
    traceAddress: number[];
    action?: {
        from?: string | undefined;
        value?: string | undefined;
        gas?: string | undefined;
        init?: string | null | undefined;
    } | undefined;
    result?: {
        gasUsed?: string | undefined;
        code?: string | null | undefined;
        address?: string | null | undefined;
    } | null | undefined;
    subtraces?: number | undefined;
    error?: string | null | undefined;
    revertReason?: string | null | undefined;
    transactionIndex?: number | undefined;
    type: "create";
} | {
    traceAddress: number[];
    action?: {
        callType?: string | undefined;
        from?: string | undefined;
        to?: string | undefined;
        value?: string | null | undefined;
        gas?: string | undefined;
        input?: string | undefined;
        sighash?: string | null | undefined;
    } | undefined;
    result?: {
        gasUsed?: string | undefined;
        output?: string | null | undefined;
    } | null | undefined;
    subtraces?: number | undefined;
    error?: string | null | undefined;
    revertReason?: string | null | undefined;
    transactionIndex?: number | undefined;
    type: "call";
} | {
    traceAddress: number[];
    action?: {
        address?: string | undefined;
        refundAddress?: string | null | undefined;
        balance?: string | undefined;
    } | undefined;
    subtraces?: number | undefined;
    error?: string | null | undefined;
    revertReason?: string | null | undefined;
    transactionIndex?: number | undefined;
    type: "suicide";
} | {
    traceAddress: number[];
    action?: {
        author?: string | undefined;
        value?: string | undefined;
        type?: string | undefined;
    } | undefined;
    subtraces?: number | undefined;
    error?: string | null | undefined;
    revertReason?: string | null | undefined;
    transactionIndex?: number | undefined;
    type: "reward";
}>;
export declare function project<T extends object, F extends {
    [K in keyof T]?: boolean;
}>(fields: F | undefined, obj: T): Partial<T>;
export declare function isEmpty(obj: object): boolean;
export declare function assertAssignable<A, B extends A>(): void;
//# sourceMappingURL=schema.d.ts.map