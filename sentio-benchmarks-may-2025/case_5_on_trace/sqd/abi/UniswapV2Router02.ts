import * as ethers from 'ethers'
import {LogEvent, Func, ContractBase} from './abi.support'
import {ABI_JSON} from './UniswapV2Router02.abi'

export const abi = new ethers.utils.Interface(ABI_JSON);

export type SwapExactTokensForTokensCall = {
    amountIn: bigint
    amountOutMin: bigint
    path: Array<string>
    to: string
    deadline: bigint
}

export function parseSwapExactTokensForTokensCall(data: string): SwapExactTokensForTokensCall {
    const result = abi.decodeFunctionData('swapExactTokensForTokens', data)
    return {
        amountIn: result[0],
        amountOutMin: result[1],
        path: result[2],
        to: result[3],
        deadline: result[4]
    }
}

export class Contract extends ContractBase {
    swapExactTokensForTokens(
        amountIn: bigint,
        amountOutMin: bigint,
        path: Array<string>,
        to: string,
        deadline: bigint
    ): Promise<Array<bigint>> {
        return this.eth_call(
            functions.swapExactTokensForTokens,
            [amountIn, amountOutMin, path, to, deadline]
        )
    }
}

export namespace functions {
    export class swapExactTokensForTokens extends Func<
        [amountIn: bigint, amountOutMin: bigint, path: Array<string>, to: string, deadline: bigint],
        Array<bigint>
    > {
        constructor() {
            super('swapExactTokensForTokens', 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', 'function')
        }
        
        decode(input: string): SwapExactTokensForTokensCall {
            return parseSwapExactTokensForTokensCall(input)
        }
    }
}

export const swapExactTokensForTokens = new functions.swapExactTokensForTokens() 