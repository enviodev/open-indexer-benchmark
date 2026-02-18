import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const functions = {
    swapExactTokensForTokens: fun("0x38ed1739", "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", {"amountIn": p.uint256, "amountOutMin": p.uint256, "path": p.array(p.address), "to": p.address, "deadline": p.uint256}, p.array(p.uint256)),
}

export class Contract extends ContractBase {
}

/// Function types
export type SwapExactTokensForTokensParams = FunctionArguments<typeof functions.swapExactTokensForTokens>
export type SwapExactTokensForTokensReturn = FunctionReturn<typeof functions.swapExactTokensForTokens>

