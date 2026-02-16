import { Validator } from '@subsquid/util-internal-validation';
import { Bytes, Bytes20 } from '../interfaces/base';
import { MappingRequest } from './request';
export declare const getBlockValidator: (obj: MappingRequest) => Validator<{
    height: number;
    hash: string;
    block: {
        transactions: (string | {
            hash: string;
            input: string;
            from: string;
            transactionIndex: number;
            to?: string | undefined;
            gas?: bigint | undefined;
            gasPrice?: bigint | undefined;
            maxFeePerGas?: bigint | undefined;
            maxPriorityFeePerGas?: bigint | undefined;
            nonce?: number | undefined;
            value?: bigint | undefined;
            v?: bigint | undefined;
            r?: string | undefined;
            s?: string | undefined;
            yParity?: number | undefined;
            chainId?: number | undefined;
            authorizationList?: {
                chainId: number;
                nonce: number;
                address: string;
                yParity: number;
                r: string;
                s: string;
            }[] | undefined;
        })[];
        number: number;
        hash: string;
        parentHash: string;
        nonce?: string | undefined;
        sha3Uncles?: string | undefined;
        logsBloom?: string | undefined;
        transactionsRoot?: string | undefined;
        stateRoot?: string | undefined;
        receiptsRoot?: string | undefined;
        mixHash?: string | undefined;
        miner?: string | undefined;
        difficulty?: bigint | undefined;
        totalDifficulty?: bigint | undefined;
        extraData?: string | undefined;
        size?: number | undefined;
        gasLimit?: bigint | undefined;
        gasUsed?: bigint | undefined;
        baseFeePerGas?: bigint | undefined;
        timestamp?: number | undefined;
        l1BlockNumber?: number | undefined;
    };
    traceReplays?: {
        transactionHash: string;
        trace?: ({
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
        })[] | undefined;
        stateDiff?: Record<string, {
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
        }> | undefined;
    }[] | undefined;
    debugFrames?: ({
        result: DebugFrame;
    } | undefined)[] | undefined;
    debugStateDiffs?: ({
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
    } | undefined)[] | undefined;
    logs?: {
        address: string;
        topics: string[];
        logIndex: number;
        transactionIndex: number;
        transactionHash?: string | undefined;
        data?: string | undefined;
    }[] | undefined;
    receipts?: {
        transactionIndex: number;
        transactionHash: string;
        logs?: {
            address: string;
            topics: string[];
            logIndex: number;
            transactionIndex: number;
            transactionHash?: string | undefined;
            data?: string | undefined;
        }[] | undefined;
        gasUsed?: bigint | undefined;
        cumulativeGasUsed?: bigint | undefined;
        effectiveGasPrice?: bigint | undefined;
        contractAddress?: string | undefined;
        type?: number | undefined;
        status?: number | undefined;
        l1Fee?: bigint | undefined;
        l1FeeScalar?: number | undefined;
        l1GasPrice?: bigint | undefined;
        l1GasUsed?: bigint | undefined;
        l1BlobBaseFee?: bigint | undefined;
        l1BlobBaseFeeScalar?: number | undefined;
        l1BaseFeeScalar?: number | undefined;
    }[] | undefined;
}, {
    height: number;
    hash: string;
    block: {
        transactions: (string | {
            hash: string;
            input: string;
            from: string;
            transactionIndex: string | number;
            to?: string | null | undefined;
            gas?: string | null | undefined;
            gasPrice?: string | null | undefined;
            maxFeePerGas?: string | null | undefined;
            maxPriorityFeePerGas?: string | null | undefined;
            nonce?: string | number | null | undefined;
            value?: string | null | undefined;
            v?: string | null | undefined;
            r?: string | null | undefined;
            s?: string | null | undefined;
            yParity?: string | number | null | undefined;
            chainId?: string | number | null | undefined;
            authorizationList?: {
                chainId: string | number;
                nonce: string | number;
                address: string;
                yParity: string | number;
                r: string;
                s: string;
            }[] | null | undefined;
        })[];
        number: string | number;
        hash: string;
        parentHash: string;
        nonce?: string | null | undefined;
        sha3Uncles?: string | null | undefined;
        logsBloom?: string | null | undefined;
        transactionsRoot?: string | null | undefined;
        stateRoot?: string | null | undefined;
        receiptsRoot?: string | null | undefined;
        mixHash?: string | null | undefined;
        miner?: string | null | undefined;
        difficulty?: string | null | undefined;
        totalDifficulty?: string | null | undefined;
        extraData?: string | null | undefined;
        size?: string | number | null | undefined;
        gasLimit?: string | null | undefined;
        gasUsed?: string | null | undefined;
        baseFeePerGas?: string | null | undefined;
        timestamp?: string | number | null | undefined;
        l1BlockNumber?: string | number | null | undefined;
    };
    traceReplays?: {
        transactionHash: string;
        trace?: ({
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
        })[] | null | undefined;
        stateDiff?: Record<string, {
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
        }> | null | undefined;
    }[] | null | undefined;
    debugFrames?: ({
        result?: unknown;
    } | null | undefined)[] | null | undefined;
    debugStateDiffs?: ({
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
    } | null | undefined)[] | null | undefined;
    logs?: {
        address: string;
        topics: string[];
        logIndex: string | number;
        transactionIndex: string | number;
        transactionHash?: string | undefined;
        data?: string | undefined;
    }[] | undefined;
    receipts?: {
        transactionIndex: string;
        transactionHash: string;
        logs?: {
            address: string;
            topics: string[];
            logIndex: string | number;
            transactionIndex: string | number;
            transactionHash?: string | undefined;
            data?: string | undefined;
        }[] | undefined;
        gasUsed?: string | null | undefined;
        cumulativeGasUsed?: string | null | undefined;
        effectiveGasPrice?: string | null | undefined;
        contractAddress?: string | null | undefined;
        type?: string | number | null | undefined;
        status?: string | number | null | undefined;
        l1Fee?: string | null | undefined;
        l1FeeScalar?: string | null | undefined;
        l1GasPrice?: string | null | undefined;
        l1GasUsed?: string | null | undefined;
        l1BlobBaseFee?: string | null | undefined;
        l1BlobBaseFeeScalar?: string | number | null | undefined;
        l1BaseFeeScalar?: string | number | null | undefined;
    }[] | undefined;
}>;
export type DebugFrame = DebugCreateFrame | DebugCallFrame | DebugSuicideFrame | DebugStopFrame;
interface DebugCreateFrame extends DebugFrameBase {
    type: 'CREATE' | 'CREATE2';
    from: Bytes20;
}
interface DebugCallFrame extends DebugFrameBase {
    type: 'CALL' | 'CALLCODE' | 'STATICCALL' | 'DELEGATECALL' | 'INVALID';
    to: Bytes20;
    input: Bytes;
}
interface DebugSuicideFrame extends DebugFrameBase {
    type: 'SELFDESTRUCT';
    to: Bytes20;
}
interface DebugStopFrame extends DebugFrameBase {
    type: 'STOP';
}
interface DebugFrameBase {
    error?: string;
    revertReason?: string;
    from?: Bytes20;
    to?: Bytes20;
    value?: bigint;
    gas?: bigint;
    gasUsed?: bigint;
    input?: Bytes;
    output?: Bytes;
    calls?: DebugFrame[];
}
export {};
//# sourceMappingURL=schema.d.ts.map