import { GetSrcType, Validator } from '@subsquid/util-internal-validation';
import { Bytes, Bytes20, Bytes32, Qty } from '../interfaces/base';
export interface DataRequest {
    logs?: boolean;
    transactions?: boolean;
    receipts?: boolean;
    traces?: boolean;
    stateDiffs?: boolean;
    preferTraceApi?: boolean;
    useDebugApiForStateDiffs?: boolean;
    debugTraceTimeout?: string;
}
export interface Block {
    height: number;
    hash: Bytes32;
    block: GetBlock;
    receipts?: TransactionReceipt[];
    logs?: Log[];
    traceReplays?: TraceTransactionReplay[];
    debugFrames?: (DebugFrameResult | undefined | null)[];
    debugStateDiffs?: (DebugStateDiffResult | undefined | null)[];
    _isInvalid?: boolean;
    _errorMessage?: string;
}
declare const Transaction: Validator<{
    blockNumber: number;
    blockHash: string;
    transactionIndex: number;
    hash: string;
    input: string;
}, {
    blockNumber: string;
    blockHash: string;
    transactionIndex: string;
    hash: string;
    input: string;
}>;
export type Transaction = GetSrcType<typeof Transaction>;
export declare const GetBlockWithTransactions: Validator<{
    number: number;
    hash: string;
    parentHash: string;
    logsBloom: string;
    transactions: {
        blockNumber: number;
        blockHash: string;
        transactionIndex: number;
        hash: string;
        input: string;
    }[];
}, {
    number: string;
    hash: string;
    parentHash: string;
    logsBloom: string;
    transactions: {
        blockNumber: string;
        blockHash: string;
        transactionIndex: string;
        hash: string;
        input: string;
    }[];
}>;
export declare const GetBlockNoTransactions: Validator<{
    number: number;
    hash: string;
    parentHash: string;
    logsBloom: string;
    transactions: string[];
}, {
    number: string;
    hash: string;
    parentHash: string;
    logsBloom: string;
    transactions: string[];
}>;
export interface GetBlock {
    number: Qty;
    hash: Bytes32;
    parentHash: Bytes32;
    logsBloom: Bytes;
    transactions: Bytes32[] | Transaction[];
}
export declare const Log: Validator<{
    blockNumber: number;
    blockHash: string;
    logIndex: number;
    transactionIndex: number;
}, {
    blockNumber: string;
    blockHash: string;
    logIndex: string;
    transactionIndex: string;
}>;
export type Log = GetSrcType<typeof Log>;
export declare const TransactionReceipt: Validator<{
    blockNumber: number;
    blockHash: string;
    transactionIndex: number;
    transactionHash: string;
    logs: {
        blockNumber: number;
        blockHash: string;
        logIndex: number;
        transactionIndex: number;
    }[];
}, {
    blockNumber: string;
    blockHash: string;
    transactionIndex: string;
    transactionHash: string;
    logs: {
        blockNumber: string;
        blockHash: string;
        logIndex: string;
        transactionIndex: string;
    }[];
}>;
export type TransactionReceipt = GetSrcType<typeof TransactionReceipt>;
export declare const DebugFrame: Validator<DebugFrame>;
export interface DebugFrame {
    type: string;
    input?: Bytes | null;
    calls?: DebugFrame[] | null;
}
export declare const DebugFrameResult: Validator<{
    result: DebugFrame;
    txHash?: string | undefined;
}, {
    result: DebugFrame;
    txHash?: string | null | undefined;
}>;
export type DebugFrameResult = GetSrcType<typeof DebugFrameResult>;
export declare const DebugStateMap: Validator<{
    balance?: bigint | undefined;
    code?: string | undefined;
    nonce?: number | undefined;
    storage?: Record<string, string> | undefined;
}, {
    balance?: string | null | undefined;
    code?: string | null | undefined;
    nonce?: number | null | undefined;
    storage?: Record<string, string> | null | undefined;
}>;
export type DebugStateMap = GetSrcType<typeof DebugStateMap>;
export declare const DebugStateDiff: Validator<{
    pre: Record<string, {
        balance?: bigint | undefined;
        code?: string | undefined;
        nonce?: number | undefined;
        storage?: Record<string, string> | undefined;
    }>;
    post: Record<string, {
        balance?: bigint | undefined;
        code?: string | undefined;
        nonce?: number | undefined;
        storage?: Record<string, string> | undefined;
    }>;
}, {
    pre: Record<string, {
        balance?: string | null | undefined;
        code?: string | null | undefined;
        nonce?: number | null | undefined;
        storage?: Record<string, string> | null | undefined;
    }>;
    post: Record<string, {
        balance?: string | null | undefined;
        code?: string | null | undefined;
        nonce?: number | null | undefined;
        storage?: Record<string, string> | null | undefined;
    }>;
}>;
export type DebugStateDiff = GetSrcType<typeof DebugStateDiff>;
export declare const DebugStateDiffResult: Validator<{
    result: {
        pre: Record<string, {
            balance?: bigint | undefined;
            code?: string | undefined;
            nonce?: number | undefined;
            storage?: Record<string, string> | undefined;
        }>;
        post: Record<string, {
            balance?: bigint | undefined;
            code?: string | undefined;
            nonce?: number | undefined;
            storage?: Record<string, string> | undefined;
        }>;
    };
    txHash?: string | undefined;
}, {
    result: {
        pre: Record<string, {
            balance?: string | null | undefined;
            code?: string | null | undefined;
            nonce?: number | null | undefined;
            storage?: Record<string, string> | null | undefined;
        }>;
        post: Record<string, {
            balance?: string | null | undefined;
            code?: string | null | undefined;
            nonce?: number | null | undefined;
            storage?: Record<string, string> | null | undefined;
        }>;
    };
    txHash?: string | null | undefined;
}>;
export type DebugStateDiffResult = GetSrcType<typeof DebugStateDiffResult>;
export declare const TraceFrame: Validator<{
    traceAddress: number[];
    type: string;
    action: {};
    blockHash?: string | undefined;
    transactionHash?: string | undefined;
}, {
    traceAddress: number[];
    type: string;
    action: {};
    blockHash?: string | null | undefined;
    transactionHash?: string | null | undefined;
}>;
export type TraceFrame = GetSrcType<typeof TraceFrame>;
declare const TraceDiff: Validator<"=" | {
    '+': string;
    '*'?: undefined;
    '-'?: undefined;
} | {
    '*': {
        from: string;
        to: string;
    };
    '+'?: undefined;
    '-'?: undefined;
} | {
    '-': string;
    '+'?: undefined;
    '*'?: undefined;
}, "=" | {
    '+': string;
    '*'?: undefined;
    '-'?: undefined;
} | {
    '*': {
        from: string;
        to: string;
    };
    '+'?: undefined;
    '-'?: undefined;
} | {
    '-': string;
    '+'?: undefined;
    '*'?: undefined;
}>;
export type TraceDiff = GetSrcType<typeof TraceDiff>;
export declare const TraceStateDiff: Validator<{
    balance: "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    };
    code: "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    };
    nonce: "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    };
    storage: Record<string, "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    }>;
}, {
    balance: "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    };
    code: "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    };
    nonce: "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    };
    storage: Record<string, "=" | {
        '+': string;
        '*'?: undefined;
        '-'?: undefined;
    } | {
        '*': {
            from: string;
            to: string;
        };
        '+'?: undefined;
        '-'?: undefined;
    } | {
        '-': string;
        '+'?: undefined;
        '*'?: undefined;
    }>;
}>;
export type TraceStateDiff = GetSrcType<typeof TraceStateDiff>;
export interface TraceTransactionReplay {
    transactionHash?: Bytes32 | null;
    trace?: TraceFrame[];
    stateDiff?: Record<Bytes20, TraceStateDiff>;
}
export interface TraceReplayTraces {
    trace?: boolean;
    stateDiff?: boolean;
}
export declare function getTraceTransactionReplayValidator(tracers: TraceReplayTraces): Validator<TraceTransactionReplay>;
export {};
//# sourceMappingURL=rpc-data.d.ts.map