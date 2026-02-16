import { FieldSelection } from '../interfaces/data';
import { DataRequest } from '../interfaces/data-request';
import { DataRequest as RpcDataRequest } from './rpc-data';
export interface MappingRequest extends RpcDataRequest {
    fields: FieldSelection;
    transactionList: boolean;
    logList: boolean;
    dataRequest: DataRequest;
}
export declare function toMappingRequest(req?: DataRequest): MappingRequest;
//# sourceMappingURL=request.d.ts.map