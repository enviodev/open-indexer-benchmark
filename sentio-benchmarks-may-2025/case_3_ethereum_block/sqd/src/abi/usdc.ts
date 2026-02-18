import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    Approval: event("0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", "Approval(address,address,uint256)", {"owner": indexed(p.address), "spender": indexed(p.address), "value": p.uint256}),
    AuthorizationCanceled: event("0x1cdd46ff242716cdaa72d159d339a485b3438398348d68f09d7c8c0a59353d81", "AuthorizationCanceled(address,bytes32)", {"authorizer": indexed(p.address), "nonce": indexed(p.bytes32)}),
    AuthorizationUsed: event("0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5", "AuthorizationUsed(address,bytes32)", {"authorizer": indexed(p.address), "nonce": indexed(p.bytes32)}),
    Blacklisted: event("0xffa4e6181777692565cf28528fc88fd1516ea86b56da075235fa575af6a4b855", "Blacklisted(address)", {"_account": indexed(p.address)}),
    BlacklisterChanged: event("0xc67398012c111ce95ecb7429b933096c977380ee6c421175a71a4a4c6c88c06e", "BlacklisterChanged(address)", {"newBlacklister": indexed(p.address)}),
    Burn: event("0xcc16f5dbb4873280815c1ee09dbd06736cffcc184412cf7a71a0fdb75d397ca5", "Burn(address,uint256)", {"burner": indexed(p.address), "amount": p.uint256}),
    MasterMinterChanged: event("0xdb66dfa9c6b8f5226fe9aac7e51897ae8ee94ac31dc70bb6c9900b2574b707e6", "MasterMinterChanged(address)", {"newMasterMinter": indexed(p.address)}),
    Mint: event("0xab8530f87dc9b59234c4623bf917212bb2536d647574c8e7e5da92c2ede0c9f8", "Mint(address,address,uint256)", {"minter": indexed(p.address), "to": indexed(p.address), "amount": p.uint256}),
    MinterConfigured: event("0x46980fca912ef9bcdbd36877427b6b90e860769f604e89c0e67720cece530d20", "MinterConfigured(address,uint256)", {"minter": indexed(p.address), "minterAllowedAmount": p.uint256}),
    MinterRemoved: event("0xe94479a9f7e1952cc78f2d6baab678adc1b772d936c6583def489e524cb66692", "MinterRemoved(address)", {"oldMinter": indexed(p.address)}),
    OwnershipTransferred: event("0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", "OwnershipTransferred(address,address)", {"previousOwner": p.address, "newOwner": p.address}),
    Pause: event("0x6985a02210a168e66602d3235cb6db0e70f92b3ba4d376a33c0f3d9434bff625", "Pause()", {}),
    PauserChanged: event("0xb80482a293ca2e013eda8683c9bd7fc8347cfdaeea5ede58cba46df502c2a604", "PauserChanged(address)", {"newAddress": indexed(p.address)}),
    RescuerChanged: event("0xe475e580d85111348e40d8ca33cfdd74c30fe1655c2d8537a13abc10065ffa5a", "RescuerChanged(address)", {"newRescuer": indexed(p.address)}),
    Transfer: event("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "Transfer(address,address,uint256)", {"from": indexed(p.address), "to": indexed(p.address), "value": p.uint256}),
    UnBlacklisted: event("0x117e3210bb9aa7d9baff172026820255c6f6c30ba8999d1c2fd88e2848137c4e", "UnBlacklisted(address)", {"_account": indexed(p.address)}),
    Unpause: event("0x7805862f689e2f13df9f062ff482ad3ad112aca9e0847911ed832e158c525b33", "Unpause()", {}),
}

export const functions = {
    CANCEL_AUTHORIZATION_TYPEHASH: viewFun("0xd9169487", "CANCEL_AUTHORIZATION_TYPEHASH()", {}, p.bytes32),
    DOMAIN_SEPARATOR: viewFun("0x3644e515", "DOMAIN_SEPARATOR()", {}, p.bytes32),
    PERMIT_TYPEHASH: viewFun("0x30adf81f", "PERMIT_TYPEHASH()", {}, p.bytes32),
    RECEIVE_WITH_AUTHORIZATION_TYPEHASH: viewFun("0x7f2eecc3", "RECEIVE_WITH_AUTHORIZATION_TYPEHASH()", {}, p.bytes32),
    TRANSFER_WITH_AUTHORIZATION_TYPEHASH: viewFun("0xa0cc6a68", "TRANSFER_WITH_AUTHORIZATION_TYPEHASH()", {}, p.bytes32),
    allowance: viewFun("0xdd62ed3e", "allowance(address,address)", {"owner": p.address, "spender": p.address}, p.uint256),
    approve: fun("0x095ea7b3", "approve(address,uint256)", {"spender": p.address, "value": p.uint256}, p.bool),
    authorizationState: viewFun("0xe94a0102", "authorizationState(address,bytes32)", {"authorizer": p.address, "nonce": p.bytes32}, p.bool),
    balanceOf: viewFun("0x70a08231", "balanceOf(address)", {"account": p.address}, p.uint256),
    blacklist: fun("0xf9f92be4", "blacklist(address)", {"_account": p.address}, ),
    blacklister: viewFun("0xbd102430", "blacklister()", {}, p.address),
    burn: fun("0x42966c68", "burn(uint256)", {"_amount": p.uint256}, ),
    cancelAuthorization: fun("0x5a049a70", "cancelAuthorization(address,bytes32,uint8,bytes32,bytes32)", {"authorizer": p.address, "nonce": p.bytes32, "v": p.uint8, "r": p.bytes32, "s": p.bytes32}, ),
    configureMinter: fun("0x4e44d956", "configureMinter(address,uint256)", {"minter": p.address, "minterAllowedAmount": p.uint256}, p.bool),
    currency: viewFun("0xe5a6b10f", "currency()", {}, p.string),
    decimals: viewFun("0x313ce567", "decimals()", {}, p.uint8),
    decreaseAllowance: fun("0xa457c2d7", "decreaseAllowance(address,uint256)", {"spender": p.address, "decrement": p.uint256}, p.bool),
    increaseAllowance: fun("0x39509351", "increaseAllowance(address,uint256)", {"spender": p.address, "increment": p.uint256}, p.bool),
    initialize: fun("0x3357162b", "initialize(string,string,string,uint8,address,address,address,address)", {"tokenName": p.string, "tokenSymbol": p.string, "tokenCurrency": p.string, "tokenDecimals": p.uint8, "newMasterMinter": p.address, "newPauser": p.address, "newBlacklister": p.address, "newOwner": p.address}, ),
    initializeV2: fun("0xd608ea64", "initializeV2(string)", {"newName": p.string}, ),
    initializeV2_1: fun("0x2fc81e09", "initializeV2_1(address)", {"lostAndFound": p.address}, ),
    isBlacklisted: viewFun("0xfe575a87", "isBlacklisted(address)", {"_account": p.address}, p.bool),
    isMinter: viewFun("0xaa271e1a", "isMinter(address)", {"account": p.address}, p.bool),
    masterMinter: viewFun("0x35d99f35", "masterMinter()", {}, p.address),
    mint: fun("0x40c10f19", "mint(address,uint256)", {"_to": p.address, "_amount": p.uint256}, p.bool),
    minterAllowance: viewFun("0x8a6db9c3", "minterAllowance(address)", {"minter": p.address}, p.uint256),
    name: viewFun("0x06fdde03", "name()", {}, p.string),
    nonces: viewFun("0x7ecebe00", "nonces(address)", {"owner": p.address}, p.uint256),
    owner: viewFun("0x8da5cb5b", "owner()", {}, p.address),
    pause: fun("0x8456cb59", "pause()", {}, ),
    paused: viewFun("0x5c975abb", "paused()", {}, p.bool),
    pauser: viewFun("0x9fd0506d", "pauser()", {}, p.address),
    permit: fun("0xd505accf", "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", {"owner": p.address, "spender": p.address, "value": p.uint256, "deadline": p.uint256, "v": p.uint8, "r": p.bytes32, "s": p.bytes32}, ),
    receiveWithAuthorization: fun("0xef55bec6", "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)", {"from": p.address, "to": p.address, "value": p.uint256, "validAfter": p.uint256, "validBefore": p.uint256, "nonce": p.bytes32, "v": p.uint8, "r": p.bytes32, "s": p.bytes32}, ),
    removeMinter: fun("0x3092afd5", "removeMinter(address)", {"minter": p.address}, p.bool),
    rescueERC20: fun("0xb2118a8d", "rescueERC20(address,address,uint256)", {"tokenContract": p.address, "to": p.address, "amount": p.uint256}, ),
    rescuer: viewFun("0x38a63183", "rescuer()", {}, p.address),
    symbol: viewFun("0x95d89b41", "symbol()", {}, p.string),
    totalSupply: viewFun("0x18160ddd", "totalSupply()", {}, p.uint256),
    transfer: fun("0xa9059cbb", "transfer(address,uint256)", {"to": p.address, "value": p.uint256}, p.bool),
    transferFrom: fun("0x23b872dd", "transferFrom(address,address,uint256)", {"from": p.address, "to": p.address, "value": p.uint256}, p.bool),
    transferOwnership: fun("0xf2fde38b", "transferOwnership(address)", {"newOwner": p.address}, ),
    transferWithAuthorization: fun("0xe3ee160e", "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)", {"from": p.address, "to": p.address, "value": p.uint256, "validAfter": p.uint256, "validBefore": p.uint256, "nonce": p.bytes32, "v": p.uint8, "r": p.bytes32, "s": p.bytes32}, ),
    unBlacklist: fun("0x1a895266", "unBlacklist(address)", {"_account": p.address}, ),
    unpause: fun("0x3f4ba83a", "unpause()", {}, ),
    updateBlacklister: fun("0xad38bf22", "updateBlacklister(address)", {"_newBlacklister": p.address}, ),
    updateMasterMinter: fun("0xaa20e1e4", "updateMasterMinter(address)", {"_newMasterMinter": p.address}, ),
    updatePauser: fun("0x554bab3c", "updatePauser(address)", {"_newPauser": p.address}, ),
    updateRescuer: fun("0x2ab60045", "updateRescuer(address)", {"newRescuer": p.address}, ),
    version: viewFun("0x54fd4d50", "version()", {}, p.string),
}

export class Contract extends ContractBase {

    CANCEL_AUTHORIZATION_TYPEHASH() {
        return this.eth_call(functions.CANCEL_AUTHORIZATION_TYPEHASH, {})
    }

    DOMAIN_SEPARATOR() {
        return this.eth_call(functions.DOMAIN_SEPARATOR, {})
    }

    PERMIT_TYPEHASH() {
        return this.eth_call(functions.PERMIT_TYPEHASH, {})
    }

    RECEIVE_WITH_AUTHORIZATION_TYPEHASH() {
        return this.eth_call(functions.RECEIVE_WITH_AUTHORIZATION_TYPEHASH, {})
    }

    TRANSFER_WITH_AUTHORIZATION_TYPEHASH() {
        return this.eth_call(functions.TRANSFER_WITH_AUTHORIZATION_TYPEHASH, {})
    }

    allowance(owner: AllowanceParams["owner"], spender: AllowanceParams["spender"]) {
        return this.eth_call(functions.allowance, {owner, spender})
    }

    authorizationState(authorizer: AuthorizationStateParams["authorizer"], nonce: AuthorizationStateParams["nonce"]) {
        return this.eth_call(functions.authorizationState, {authorizer, nonce})
    }

    balanceOf(account: BalanceOfParams["account"]) {
        return this.eth_call(functions.balanceOf, {account})
    }

    blacklister() {
        return this.eth_call(functions.blacklister, {})
    }

    currency() {
        return this.eth_call(functions.currency, {})
    }

    decimals() {
        return this.eth_call(functions.decimals, {})
    }

    isBlacklisted(_account: IsBlacklistedParams["_account"]) {
        return this.eth_call(functions.isBlacklisted, {_account})
    }

    isMinter(account: IsMinterParams["account"]) {
        return this.eth_call(functions.isMinter, {account})
    }

    masterMinter() {
        return this.eth_call(functions.masterMinter, {})
    }

    minterAllowance(minter: MinterAllowanceParams["minter"]) {
        return this.eth_call(functions.minterAllowance, {minter})
    }

    name() {
        return this.eth_call(functions.name, {})
    }

    nonces(owner: NoncesParams["owner"]) {
        return this.eth_call(functions.nonces, {owner})
    }

    owner() {
        return this.eth_call(functions.owner, {})
    }

    paused() {
        return this.eth_call(functions.paused, {})
    }

    pauser() {
        return this.eth_call(functions.pauser, {})
    }

    rescuer() {
        return this.eth_call(functions.rescuer, {})
    }

    symbol() {
        return this.eth_call(functions.symbol, {})
    }

    totalSupply() {
        return this.eth_call(functions.totalSupply, {})
    }

    version() {
        return this.eth_call(functions.version, {})
    }
}

/// Event types
export type ApprovalEventArgs = EParams<typeof events.Approval>
export type AuthorizationCanceledEventArgs = EParams<typeof events.AuthorizationCanceled>
export type AuthorizationUsedEventArgs = EParams<typeof events.AuthorizationUsed>
export type BlacklistedEventArgs = EParams<typeof events.Blacklisted>
export type BlacklisterChangedEventArgs = EParams<typeof events.BlacklisterChanged>
export type BurnEventArgs = EParams<typeof events.Burn>
export type MasterMinterChangedEventArgs = EParams<typeof events.MasterMinterChanged>
export type MintEventArgs = EParams<typeof events.Mint>
export type MinterConfiguredEventArgs = EParams<typeof events.MinterConfigured>
export type MinterRemovedEventArgs = EParams<typeof events.MinterRemoved>
export type OwnershipTransferredEventArgs = EParams<typeof events.OwnershipTransferred>
export type PauseEventArgs = EParams<typeof events.Pause>
export type PauserChangedEventArgs = EParams<typeof events.PauserChanged>
export type RescuerChangedEventArgs = EParams<typeof events.RescuerChanged>
export type TransferEventArgs = EParams<typeof events.Transfer>
export type UnBlacklistedEventArgs = EParams<typeof events.UnBlacklisted>
export type UnpauseEventArgs = EParams<typeof events.Unpause>

/// Function types
export type CANCEL_AUTHORIZATION_TYPEHASHParams = FunctionArguments<typeof functions.CANCEL_AUTHORIZATION_TYPEHASH>
export type CANCEL_AUTHORIZATION_TYPEHASHReturn = FunctionReturn<typeof functions.CANCEL_AUTHORIZATION_TYPEHASH>

export type DOMAIN_SEPARATORParams = FunctionArguments<typeof functions.DOMAIN_SEPARATOR>
export type DOMAIN_SEPARATORReturn = FunctionReturn<typeof functions.DOMAIN_SEPARATOR>

export type PERMIT_TYPEHASHParams = FunctionArguments<typeof functions.PERMIT_TYPEHASH>
export type PERMIT_TYPEHASHReturn = FunctionReturn<typeof functions.PERMIT_TYPEHASH>

export type RECEIVE_WITH_AUTHORIZATION_TYPEHASHParams = FunctionArguments<typeof functions.RECEIVE_WITH_AUTHORIZATION_TYPEHASH>
export type RECEIVE_WITH_AUTHORIZATION_TYPEHASHReturn = FunctionReturn<typeof functions.RECEIVE_WITH_AUTHORIZATION_TYPEHASH>

export type TRANSFER_WITH_AUTHORIZATION_TYPEHASHParams = FunctionArguments<typeof functions.TRANSFER_WITH_AUTHORIZATION_TYPEHASH>
export type TRANSFER_WITH_AUTHORIZATION_TYPEHASHReturn = FunctionReturn<typeof functions.TRANSFER_WITH_AUTHORIZATION_TYPEHASH>

export type AllowanceParams = FunctionArguments<typeof functions.allowance>
export type AllowanceReturn = FunctionReturn<typeof functions.allowance>

export type ApproveParams = FunctionArguments<typeof functions.approve>
export type ApproveReturn = FunctionReturn<typeof functions.approve>

export type AuthorizationStateParams = FunctionArguments<typeof functions.authorizationState>
export type AuthorizationStateReturn = FunctionReturn<typeof functions.authorizationState>

export type BalanceOfParams = FunctionArguments<typeof functions.balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof functions.balanceOf>

export type BlacklistParams = FunctionArguments<typeof functions.blacklist>
export type BlacklistReturn = FunctionReturn<typeof functions.blacklist>

export type BlacklisterParams = FunctionArguments<typeof functions.blacklister>
export type BlacklisterReturn = FunctionReturn<typeof functions.blacklister>

export type BurnParams = FunctionArguments<typeof functions.burn>
export type BurnReturn = FunctionReturn<typeof functions.burn>

export type CancelAuthorizationParams = FunctionArguments<typeof functions.cancelAuthorization>
export type CancelAuthorizationReturn = FunctionReturn<typeof functions.cancelAuthorization>

export type ConfigureMinterParams = FunctionArguments<typeof functions.configureMinter>
export type ConfigureMinterReturn = FunctionReturn<typeof functions.configureMinter>

export type CurrencyParams = FunctionArguments<typeof functions.currency>
export type CurrencyReturn = FunctionReturn<typeof functions.currency>

export type DecimalsParams = FunctionArguments<typeof functions.decimals>
export type DecimalsReturn = FunctionReturn<typeof functions.decimals>

export type DecreaseAllowanceParams = FunctionArguments<typeof functions.decreaseAllowance>
export type DecreaseAllowanceReturn = FunctionReturn<typeof functions.decreaseAllowance>

export type IncreaseAllowanceParams = FunctionArguments<typeof functions.increaseAllowance>
export type IncreaseAllowanceReturn = FunctionReturn<typeof functions.increaseAllowance>

export type InitializeParams = FunctionArguments<typeof functions.initialize>
export type InitializeReturn = FunctionReturn<typeof functions.initialize>

export type InitializeV2Params = FunctionArguments<typeof functions.initializeV2>
export type InitializeV2Return = FunctionReturn<typeof functions.initializeV2>

export type InitializeV2_1Params = FunctionArguments<typeof functions.initializeV2_1>
export type InitializeV2_1Return = FunctionReturn<typeof functions.initializeV2_1>

export type IsBlacklistedParams = FunctionArguments<typeof functions.isBlacklisted>
export type IsBlacklistedReturn = FunctionReturn<typeof functions.isBlacklisted>

export type IsMinterParams = FunctionArguments<typeof functions.isMinter>
export type IsMinterReturn = FunctionReturn<typeof functions.isMinter>

export type MasterMinterParams = FunctionArguments<typeof functions.masterMinter>
export type MasterMinterReturn = FunctionReturn<typeof functions.masterMinter>

export type MintParams = FunctionArguments<typeof functions.mint>
export type MintReturn = FunctionReturn<typeof functions.mint>

export type MinterAllowanceParams = FunctionArguments<typeof functions.minterAllowance>
export type MinterAllowanceReturn = FunctionReturn<typeof functions.minterAllowance>

export type NameParams = FunctionArguments<typeof functions.name>
export type NameReturn = FunctionReturn<typeof functions.name>

export type NoncesParams = FunctionArguments<typeof functions.nonces>
export type NoncesReturn = FunctionReturn<typeof functions.nonces>

export type OwnerParams = FunctionArguments<typeof functions.owner>
export type OwnerReturn = FunctionReturn<typeof functions.owner>

export type PauseParams = FunctionArguments<typeof functions.pause>
export type PauseReturn = FunctionReturn<typeof functions.pause>

export type PausedParams = FunctionArguments<typeof functions.paused>
export type PausedReturn = FunctionReturn<typeof functions.paused>

export type PauserParams = FunctionArguments<typeof functions.pauser>
export type PauserReturn = FunctionReturn<typeof functions.pauser>

export type PermitParams = FunctionArguments<typeof functions.permit>
export type PermitReturn = FunctionReturn<typeof functions.permit>

export type ReceiveWithAuthorizationParams = FunctionArguments<typeof functions.receiveWithAuthorization>
export type ReceiveWithAuthorizationReturn = FunctionReturn<typeof functions.receiveWithAuthorization>

export type RemoveMinterParams = FunctionArguments<typeof functions.removeMinter>
export type RemoveMinterReturn = FunctionReturn<typeof functions.removeMinter>

export type RescueERC20Params = FunctionArguments<typeof functions.rescueERC20>
export type RescueERC20Return = FunctionReturn<typeof functions.rescueERC20>

export type RescuerParams = FunctionArguments<typeof functions.rescuer>
export type RescuerReturn = FunctionReturn<typeof functions.rescuer>

export type SymbolParams = FunctionArguments<typeof functions.symbol>
export type SymbolReturn = FunctionReturn<typeof functions.symbol>

export type TotalSupplyParams = FunctionArguments<typeof functions.totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof functions.totalSupply>

export type TransferParams = FunctionArguments<typeof functions.transfer>
export type TransferReturn = FunctionReturn<typeof functions.transfer>

export type TransferFromParams = FunctionArguments<typeof functions.transferFrom>
export type TransferFromReturn = FunctionReturn<typeof functions.transferFrom>

export type TransferOwnershipParams = FunctionArguments<typeof functions.transferOwnership>
export type TransferOwnershipReturn = FunctionReturn<typeof functions.transferOwnership>

export type TransferWithAuthorizationParams = FunctionArguments<typeof functions.transferWithAuthorization>
export type TransferWithAuthorizationReturn = FunctionReturn<typeof functions.transferWithAuthorization>

export type UnBlacklistParams = FunctionArguments<typeof functions.unBlacklist>
export type UnBlacklistReturn = FunctionReturn<typeof functions.unBlacklist>

export type UnpauseParams = FunctionArguments<typeof functions.unpause>
export type UnpauseReturn = FunctionReturn<typeof functions.unpause>

export type UpdateBlacklisterParams = FunctionArguments<typeof functions.updateBlacklister>
export type UpdateBlacklisterReturn = FunctionReturn<typeof functions.updateBlacklister>

export type UpdateMasterMinterParams = FunctionArguments<typeof functions.updateMasterMinter>
export type UpdateMasterMinterReturn = FunctionReturn<typeof functions.updateMasterMinter>

export type UpdatePauserParams = FunctionArguments<typeof functions.updatePauser>
export type UpdatePauserReturn = FunctionReturn<typeof functions.updatePauser>

export type UpdateRescuerParams = FunctionArguments<typeof functions.updateRescuer>
export type UpdateRescuerReturn = FunctionReturn<typeof functions.updateRescuer>

export type VersionParams = FunctionArguments<typeof functions.version>
export type VersionReturn = FunctionReturn<typeof functions.version>

