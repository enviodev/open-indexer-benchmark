import { Logger } from '@subsquid/logger';
import { RpcClient } from '@subsquid/rpc-client';
import { Batch, HotDatabaseState, HotDataSource, HotUpdate } from '@subsquid/util-internal-processor-tools';
import { RangeRequest, RangeRequestList } from '@subsquid/util-internal-range';
import { Bytes32 } from '../interfaces/base';
import { DataRequest } from '../interfaces/data-request';
import { Block } from '../mapping/entities';
import { RpcValidationFlags } from './rpc';
export interface EvmRpcDataSourceOptions {
    rpc: RpcClient;
    finalityConfirmation: number;
    newHeadTimeout?: number;
    headPollInterval?: number;
    preferTraceApi?: boolean;
    useDebugApiForStateDiffs?: boolean;
    debugTraceTimeout?: string;
    log?: Logger;
    validationFlags?: RpcValidationFlags;
}
export declare class EvmRpcDataSource implements HotDataSource<Block, DataRequest> {
    private rpc;
    private finalityConfirmation;
    private headPollInterval;
    private newHeadTimeout;
    private preferTraceApi?;
    private useDebugApiForStateDiffs?;
    private debugTraceTimeout?;
    private log?;
    constructor(options: EvmRpcDataSourceOptions);
    getFinalizedHeight(): Promise<number>;
    getBlockHash(height: number): Promise<Bytes32 | undefined>;
    getFinalizedBlocks(requests: RangeRequest<DataRequest>[], stopOnHead?: boolean): AsyncIterable<Batch<Block>>;
    private _getColdSplit;
    private toMappingRequest;
    processHotBlocks(requests: RangeRequestList<DataRequest>, state: HotDatabaseState, cb: (upd: HotUpdate<Block>) => Promise<void>): Promise<void>;
    private polling;
    private subscription;
    private subscribeNewHeads;
}
//# sourceMappingURL=client.d.ts.map