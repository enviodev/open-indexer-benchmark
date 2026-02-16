import { Bytes32, Qty } from '../interfaces/base';
export declare function qty2Int(qty: Qty): number;
export declare function toQty(i: number): Qty;
export declare function getTxHash(tx: Bytes32 | {
    hash: Bytes32;
}): Bytes32;
//# sourceMappingURL=util.d.ts.map