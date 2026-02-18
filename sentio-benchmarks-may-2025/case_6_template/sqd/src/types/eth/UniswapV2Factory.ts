import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    PairCreated: event("0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9", "PairCreated(address,address,address,uint256)", {"token0": indexed(p.address), "token1": indexed(p.address), "pair": p.address, "_3": p.uint256}),
}

export class Contract extends ContractBase {
}

/// Event types
export type PairCreatedEventArgs = EParams<typeof events.PairCreated>
