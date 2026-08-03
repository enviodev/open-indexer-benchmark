import * as p from '@subsquid/evm-codec'
import {event, indexed} from '@subsquid/evm-abi'
import type {EventParams as EParams} from '@subsquid/evm-abi'

export const events = {
    ProxyCreation: event(
        "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235",
        "ProxyCreation(address,address)",
        {"proxy": p.address, "singleton": p.address}
    ),
    // Safe 1.4.1 onwards. Identical signature — and so identical topic0 — but
    // `proxy` is indexed, which moves it out of the data payload. The two
    // layouts cannot decode each other's logs.
    ProxyCreationIndexed: event(
        "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235",
        "ProxyCreation(address,address)",
        {"proxy": indexed(p.address), "singleton": p.address}
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
    SafeReceived: event(
        "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d",
        "SafeReceived(address,uint256)",
        {"sender": indexed(p.address), "value": p.uint256}
    ),
    SafeModuleTransaction: event(
        "0xb648d3644f584ed1c2232d53c46d87e693586486ad0d1175f8656013110b714e",
        "SafeModuleTransaction(address,address,uint256,bytes,uint8)",
        {
            "module": p.address,
            "to": p.address,
            "value": p.uint256,
            "data": p.bytes,
            "operation": p.uint8
        }
    ),
}

export type ProxyCreationEventArgs = EParams<typeof events.ProxyCreation>
export type SafeSetupEventArgs = EParams<typeof events.SafeSetup>
