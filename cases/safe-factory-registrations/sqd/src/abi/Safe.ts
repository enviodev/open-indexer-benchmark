import * as p from '@subsquid/evm-codec'
import {event, indexed} from '@subsquid/evm-abi'
import type {EventParams as EParams} from '@subsquid/evm-abi'

export const events = {
    ProxyCreation: event(
        "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235",
        "ProxyCreation(address,address)",
        {"proxy": p.address, "singleton": p.address}
    ),
    SafeSetup: event(
        "0x141df868a6331af528e38c83b7aa03edc19be66e37ae67f9285bf4f8e3c6a1a8",
        "SafeSetup(address,address[],uint256,address,address)",
        {
            "initiator": indexed(p.address),
            "owners": p.array(p.address),
            "threshold": p.uint256,
            "initializer": p.address,
            "fallbackHandler": p.address
        }
    ),
}

export type ProxyCreationEventArgs = EParams<typeof events.ProxyCreation>
export type SafeSetupEventArgs = EParams<typeof events.SafeSetup>
