import { Bytes, Bytes20, Bytes32, Bytes8 } from '../interfaces/base';
import { EIP7702Authorization, EvmTraceCallAction, EvmTraceCallResult, EvmTraceCreateAction, EvmTraceCreateResult, EvmTraceRewardAction, EvmTraceSuicideAction } from '../interfaces/evm';
export declare class Block {
    header: BlockHeader;
    transactions: Transaction[];
    logs: Log[];
    traces: Trace[];
    stateDiffs: StateDiff[];
    constructor(header: BlockHeader);
}
export declare class BlockHeader {
    id: string;
    height: number;
    hash: Bytes32;
    parentHash: Bytes32;
    nonce?: Bytes8;
    sha3Uncles?: Bytes32;
    logsBloom?: Bytes;
    transactionsRoot?: Bytes32;
    stateRoot?: Bytes32;
    receiptsRoot?: Bytes32;
    mixHash?: Bytes;
    miner?: Bytes20;
    difficulty?: bigint;
    totalDifficulty?: bigint;
    extraData?: Bytes;
    size?: bigint;
    gasLimit?: bigint;
    gasUsed?: bigint;
    timestamp?: number;
    baseFeePerGas?: bigint;
    l1BlockNumber?: number;
    constructor(height: number, hash: Bytes20, parentHash: Bytes20);
}
export declare class Transaction {
    #private;
    id: string;
    transactionIndex: number;
    from?: Bytes20;
    gas?: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    hash?: Bytes32;
    input?: Bytes;
    nonce?: number;
    to?: Bytes20;
    value?: bigint;
    v?: bigint;
    r?: Bytes32;
    s?: Bytes32;
    yParity?: number;
    chainId?: number;
    gasUsed?: bigint;
    cumulativeGasUsed?: bigint;
    effectiveGasPrice?: bigint;
    contractAddress?: Bytes32;
    type?: number;
    status?: number;
    sighash?: Bytes;
    authorizationList?: EIP7702Authorization[];
    l1Fee?: bigint;
    l1FeeScalar?: number;
    l1GasPrice?: bigint;
    l1GasUsed?: bigint;
    l1BlobBaseFee?: bigint;
    l1BlobBaseFeeScalar?: number;
    l1BaseFeeScalar?: number;
    constructor(block: BlockHeader, transactionIndex: number);
    get block(): BlockHeader;
    get logs(): Log[];
    set logs(value: Log[]);
    get traces(): Trace[];
    set traces(value: Trace[]);
    get stateDiffs(): StateDiff[];
    set stateDiffs(value: StateDiff[]);
}
export declare class Log {
    #private;
    id: string;
    logIndex: number;
    transactionIndex: number;
    transactionHash?: Bytes32;
    address?: Bytes20;
    data?: Bytes;
    topics?: Bytes32[];
    constructor(block: BlockHeader, logIndex: number, transactionIndex: number);
    get block(): BlockHeader;
    get transaction(): Transaction | undefined;
    set transaction(value: Transaction | undefined);
    getTransaction(): Transaction;
}
declare class TraceBase {
    #private;
    id: string;
    transactionIndex: number;
    traceAddress: number[];
    subtraces?: number;
    error?: string | null;
    revertReason?: string;
    constructor(block: BlockHeader, transactionIndex: number, traceAddress: number[]);
    get block(): BlockHeader;
    get transaction(): Transaction | undefined;
    set transaction(value: Transaction | undefined);
    getTransaction(): Transaction;
    get parent(): Trace | undefined;
    set parent(value: Trace | undefined);
    getParent(): Trace;
    get children(): Trace[];
    set children(value: Trace[]);
}
export declare class TraceCreate extends TraceBase {
    type: 'create';
    action?: Partial<EvmTraceCreateAction>;
    result?: Partial<EvmTraceCreateResult>;
}
export declare class TraceCall extends TraceBase {
    type: 'call';
    action?: Partial<EvmTraceCallAction>;
    result?: Partial<EvmTraceCallResult>;
}
export declare class TraceSuicide extends TraceBase {
    type: 'suicide';
    action?: Partial<EvmTraceSuicideAction>;
}
export declare class TraceReward extends TraceBase {
    type: 'reward';
    action?: Partial<EvmTraceRewardAction>;
}
export type Trace = TraceCreate | TraceCall | TraceSuicide | TraceReward;
declare class StateDiffBase {
    #private;
    transactionIndex: number;
    address: Bytes20;
    key: 'balance' | 'code' | 'nonce' | Bytes32;
    constructor(block: BlockHeader, transactionIndex: number, address: Bytes20, key: 'balance' | 'code' | 'nonce' | Bytes32);
    get block(): BlockHeader;
    get transaction(): Transaction | undefined;
    set transaction(value: Transaction | undefined);
    getTransaction(): Transaction;
}
export declare class StateDiffNoChange extends StateDiffBase {
    kind: '=';
    prev?: null;
    next?: null;
}
export declare class StateDiffAdd extends StateDiffBase {
    kind: '+';
    prev?: null;
    next?: Bytes;
}
export declare class StateDiffChange extends StateDiffBase {
    kind: '*';
    prev?: Bytes;
    next?: Bytes;
}
export declare class StateDiffDelete extends StateDiffBase {
    kind: '-';
    prev?: Bytes;
    next?: null;
}
export type StateDiff = StateDiffNoChange | StateDiffAdd | StateDiffChange | StateDiffDelete;
export {};
//# sourceMappingURL=entities.d.ts.map