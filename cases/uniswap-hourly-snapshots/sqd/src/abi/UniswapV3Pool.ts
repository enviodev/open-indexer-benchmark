import * as p from '@subsquid/evm-codec'
import {event, indexed} from '@subsquid/evm-abi'
import type {EventParams as EParams} from '@subsquid/evm-abi'

export const events = {
    Swap: event(
        "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
        "Swap(address,address,int256,int256,uint160,uint128,int24)",
        {"sender": indexed(p.address), "recipient": indexed(p.address), "amount0": p.int256, "amount1": p.int256, "sqrtPriceX96": p.uint160, "liquidity": p.uint128, "tick": p.int24}
    ),
}

export type SwapEventArgs = EParams<typeof events.Swap>
