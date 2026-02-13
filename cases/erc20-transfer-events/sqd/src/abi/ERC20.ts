import * as p from '@subsquid/evm-codec'
import {event, indexed} from '@subsquid/evm-abi'
import type {EventParams as EParams} from '@subsquid/evm-abi'

export const events = {
    Transfer: event(
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        "Transfer(address,address,uint256)",
        {"from": indexed(p.address), "to": indexed(p.address), "value": p.uint256}
    ),
    Approval: event(
        "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
        "Approval(address,address,uint256)",
        {"owner": indexed(p.address), "spender": indexed(p.address), "value": p.uint256}
    ),
}

export type TransferEventArgs = EParams<typeof events.Transfer>
export type ApprovalEventArgs = EParams<typeof events.Approval>
