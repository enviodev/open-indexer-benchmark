import { Logger } from '@subsquid/logger';
import { CallOptions, RpcClient } from '@subsquid/rpc-client';
import { SplitRequest } from '@subsquid/util-internal-range';
import { Bytes, Bytes32 } from '../interfaces/base';
import { Block, DataRequest, GetBlock, Log } from './rpc-data';
export interface RpcValidationFlags {
    /**
     * Checks the logs list is non-empty if logsBloom is non-zero
     */
    disableLogsBloomCheck?: boolean;
    /**
     * Checks the tx count matches the number tx receipts
     */
    disableTxReceiptsNumberCheck?: boolean;
    /**
     * Checks if the are no traces for a non-empty block
     */
    disableMissingTracesCheck?: boolean;
    /**
     * Checks the block hash matches the trace blockHash field
     */
    disableTraceBlockHashCheck?: boolean;
    /**
     * Checks the block hash matches the tx receipt blockHash field
     */
    disableTxReceiptBlockHashCheck?: boolean;
}
export declare class Rpc {
    readonly client: RpcClient;
    private log?;
    private validation;
    private genesisHeight;
    private priority;
    private props;
    constructor(client: RpcClient, log?: Logger | undefined, validation?: RpcValidationFlags, genesisHeight?: number, priority?: number, props?: RpcProps);
    withPriority(priority: number): Rpc;
    call<T = any>(method: string, params?: any[], options?: CallOptions<T>): Promise<T>;
    batchCall<T = any>(batch: {
        method: string;
        params?: any[];
    }[], options?: CallOptions<T>): Promise<T[]>;
    getBlockByNumber(height: number, withTransactions: boolean): Promise<GetBlock | null>;
    getBlockByHash(hash: Bytes, withTransactions: boolean): Promise<GetBlock | null>;
    getBlockHash(height: number): Promise<Bytes | undefined>;
    getHeight(): Promise<number>;
    getColdBlock(blockHash: Bytes32, req?: DataRequest, finalizedHeight?: number): Promise<Block>;
    getColdSplit(req: SplitRequest<DataRequest>): Promise<Block[]>;
    private addColdRequestedData;
    private getColdBlockBatch;
    getHotSplit(req: SplitRequest<DataRequest> & {
        finalizedHeight: number;
    }): Promise<Block[]>;
    private getBlockBatch;
    private addRequestedData;
    private addLogs;
    getLogs(from: number, to: number): Promise<Log[]>;
    private getLogsByReceipts;
    private addReceipts;
    private addReceiptsByBlock;
    private addReceiptsByTx;
    private addTraceTxReplays;
    private addTraceBlockTraces;
    private addDebugFrames;
    private addDebugStateDiffs;
    private matchDebugTrace;
    private addArbitrumOneTraces;
    private addTraces;
}
type GetReceiptsMethod = 'eth_getTransactionReceipt' | 'eth_getBlockReceipts' | 'alchemy_getTransactionReceipts';
declare class RpcProps {
    private client;
    private genesisHeight;
    private genesisHash?;
    private receiptsMethod?;
    constructor(client: RpcClient, genesisHeight?: number);
    getGenesisHash(): Promise<Bytes>;
    getReceiptsMethod(): Promise<GetReceiptsMethod>;
}
export {};
//# sourceMappingURL=rpc.d.ts.map