import * as p from '@subsquid/evm-codec'
import {event, indexed} from '@subsquid/evm-abi'
import type {EventParams as EParams} from '@subsquid/evm-abi'

/** One topic0 per event, shared by both layouts of the eight overloaded ones. */
export const TOPICS = {
    safeSetup: "0x141df868a6331af528e38c83b7aa03edc19be66e37ae67f9285bf4f8e3c6a1a8",
    safeReceived: "0x3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d",
    safeModuleTransaction: "0xb648d3644f584ed1c2232d53c46d87e693586486ad0d1175f8656013110b714e",
    safeMultiSigTransaction: "0x66753cd2356569ee081232e3be8909b950e0a76c1f8460c3a5e3c2be32b11bed",
    executionSuccess: "0x442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e",
    executionFailure: "0x23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23",
    changedThreshold: "0x610f7ff2b304ae8903c3de74c60c6ab1f7d6226b3f52c5161905bb5ad4039c93",
    changedMasterCopy: "0x75e41bc35ff1bf14d81d1d2f649c0084a0f974f9289c803ec9898eeec4c8d0b8",
    changedFallbackHandler: "0x5ac6c46c93c8d0e53714ba3b53db3e7c046da994313d7ed0d192028bc7c228b0",
    changedGuard: "0x1151116914515bc0891ff9047a6cb32cf902546f83066499bcf8ba33d2353fa2",
    changedModuleGuard: "0xcd1966d6be16bc0c030cc741a06c6e0efaf8d00de2c8b6a9e11827e125de8bb8",
    enabledModule: "0xecdf3a3effea5783a3c4c2140e677577666428d44ed9d474a0b3a4c9943f8440",
    disabledModule: "0xaab4fa2b463f581b2b32cb3b7e3b704b9ce37cc209b5fb4d77e593ace4054276",
    addedOwner: "0x9465fa0c962cc76958e6373a993326400c1c94f8be2fe3a952adfa7f60b2ea26",
    removedOwner: "0xf8d49fc529812e9a7c5c50e69c20f0dccc0db8fa95c98bc58cc9a4f1c1299eaf",
}

// Safe 1.4.x made an argument of eight of these `indexed` without changing
// the signature. The `V4` entries decode that layout; the topic0 is the same,
// so which decoder applies is decided per log, from its topic count.
export const events = {
    ProxyCreation: event(
        "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235",
        "ProxyCreation(address,address)",
        {"proxy": p.address, "singleton": p.address}
    ),
    // Safe 1.4.1 onwards. Identical signature — and so identical topic0 — but
    // `proxy` is indexed, which moves it out of the data payload.
    ProxyCreationIndexed: event(
        "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235",
        "ProxyCreation(address,address)",
        {"proxy": indexed(p.address), "singleton": p.address}
    ),
    SafeSetup: event(
        TOPICS.safeSetup,
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
        TOPICS.safeReceived,
        "SafeReceived(address,uint256)",
        {
            "sender": indexed(p.address),
            "value": p.uint256
        }
    ),
    SafeModuleTransaction: event(
        TOPICS.safeModuleTransaction,
        "SafeModuleTransaction(address,address,uint256,bytes,uint8)",
        {
            "module": p.address,
            "to": p.address,
            "value": p.uint256,
            "data": p.bytes,
            "operation": p.uint8
        }
    ),
    SafeMultiSigTransaction: event(
        TOPICS.safeMultiSigTransaction,
        "SafeMultiSigTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,bytes)",
        {
            "to": p.address,
            "value": p.uint256,
            "data": p.bytes,
            "operation": p.uint8,
            "safeTxGas": p.uint256,
            "baseGas": p.uint256,
            "gasPrice": p.uint256,
            "gasToken": p.address,
            "refundReceiver": p.address,
            "signatures": p.bytes,
            "additionalInfo": p.bytes
        }
    ),
    ExecutionSuccess: event(
        TOPICS.executionSuccess,
        "ExecutionSuccess(bytes32,uint256)",
        {
            "txHash": p.bytes32,
            "payment": p.uint256
        }
    ),
    ExecutionSuccessV4: event(
        TOPICS.executionSuccess,
        "ExecutionSuccess(bytes32,uint256)",
        {
            "txHash": indexed(p.bytes32),
            "payment": p.uint256
        }
    ),
    ExecutionFailure: event(
        TOPICS.executionFailure,
        "ExecutionFailure(bytes32,uint256)",
        {
            "txHash": p.bytes32,
            "payment": p.uint256
        }
    ),
    ExecutionFailureV4: event(
        TOPICS.executionFailure,
        "ExecutionFailure(bytes32,uint256)",
        {
            "txHash": indexed(p.bytes32),
            "payment": p.uint256
        }
    ),
    ChangedThreshold: event(
        TOPICS.changedThreshold,
        "ChangedThreshold(uint256)",
        {
            "threshold": p.uint256
        }
    ),
    ChangedMasterCopy: event(
        TOPICS.changedMasterCopy,
        "ChangedMasterCopy(address)",
        {
            "singleton": p.address
        }
    ),
    ChangedFallbackHandler: event(
        TOPICS.changedFallbackHandler,
        "ChangedFallbackHandler(address)",
        {
            "handler": p.address
        }
    ),
    ChangedFallbackHandlerV4: event(
        TOPICS.changedFallbackHandler,
        "ChangedFallbackHandler(address)",
        {
            "handler": indexed(p.address)
        }
    ),
    ChangedGuard: event(
        TOPICS.changedGuard,
        "ChangedGuard(address)",
        {
            "guard": p.address
        }
    ),
    ChangedGuardV4: event(
        TOPICS.changedGuard,
        "ChangedGuard(address)",
        {
            "guard": indexed(p.address)
        }
    ),
    ChangedModuleGuard: event(
        TOPICS.changedModuleGuard,
        "ChangedModuleGuard(address)",
        {
            "moduleGuard": indexed(p.address)
        }
    ),
    EnabledModule: event(
        TOPICS.enabledModule,
        "EnabledModule(address)",
        {
            "module": p.address
        }
    ),
    EnabledModuleV4: event(
        TOPICS.enabledModule,
        "EnabledModule(address)",
        {
            "module": indexed(p.address)
        }
    ),
    DisabledModule: event(
        TOPICS.disabledModule,
        "DisabledModule(address)",
        {
            "module": p.address
        }
    ),
    DisabledModuleV4: event(
        TOPICS.disabledModule,
        "DisabledModule(address)",
        {
            "module": indexed(p.address)
        }
    ),
    AddedOwner: event(
        TOPICS.addedOwner,
        "AddedOwner(address)",
        {
            "owner": p.address
        }
    ),
    AddedOwnerV4: event(
        TOPICS.addedOwner,
        "AddedOwner(address)",
        {
            "owner": indexed(p.address)
        }
    ),
    RemovedOwner: event(
        TOPICS.removedOwner,
        "RemovedOwner(address)",
        {
            "owner": p.address
        }
    ),
    RemovedOwnerV4: event(
        TOPICS.removedOwner,
        "RemovedOwner(address)",
        {
            "owner": indexed(p.address)
        }
    ),
}

export type ProxyCreationEventArgs = EParams<typeof events.ProxyCreation>
