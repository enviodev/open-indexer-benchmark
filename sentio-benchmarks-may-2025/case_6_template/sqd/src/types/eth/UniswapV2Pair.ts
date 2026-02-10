import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    Swap: event("0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", "Swap(address,uint256,uint256,uint256,uint256,address)", {"sender": indexed(p.address), "amount0In": p.uint256, "amount1In": p.uint256, "amount0Out": p.uint256, "amount1Out": p.uint256, "to": indexed(p.address)}),
}

export const functions = {
    getReserves: viewFun("0x0902f1ac", "getReserves()", {}, {"_reserve0": p.uint112, "_reserve1": p.uint112, "_blockTimestampLast": p.uint32}),
}

export class Contract extends ContractBase {

    getReserves() {
        return this.eth_call(functions.getReserves, {})
    }
}

/// Event types
export type SwapEventArgs = EParams<typeof events.Swap>

/// Function types
export type GetReservesParams = FunctionArguments<typeof functions.getReserves>
export type GetReservesReturn = FunctionReturn<typeof functions.getReserves>

