import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    Approval: event("0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", "Approval(address,address,uint256)", {"owner": indexed(p.address), "spender": indexed(p.address), "value": p.uint256}),
    BasculeChanged: event("0xa0317ebf02283589c190260fcd549e3a6de71bef31204aeb5417c07fb65c0894", "BasculeChanged(address,address)", {"prevVal": indexed(p.address), "newVal": indexed(p.address)}),
    BatchMintSkipped: event("0x199445030f34ba18eca81d4647be9cf6943287dd1a58d150f9cf093111240bff", "BatchMintSkipped(bytes32,bytes)", {"payloadHash": indexed(p.bytes32), "payload": p.bytes}),
    BridgeChanged: event("0xd565484d693f5157abcceb853139678038bc740991b0a4dc3baa2426325bb3c0", "BridgeChanged(address,address)", {"prevVal": indexed(p.address), "newVal": indexed(p.address)}),
    BurnCommissionChanged: event("0x2e7c1540076270015f38f524150bcb5d6ba9db14aca34c2e6d32e6ffad37941a", "BurnCommissionChanged(uint64,uint64)", {"prevValue": indexed(p.uint64), "newValue": indexed(p.uint64)}),
    ClaimerUpdated: event("0x0d4de5cd7f05b154b7f42e4f1dd68f5c27ea0edaf9bd084309201cfa52e85926", "ClaimerUpdated(address,bool)", {"claimer": indexed(p.address), "isClaimer": p.bool}),
    ConsortiumChanged: event("0x146dd8feba84cdc776f012478adc764591d6c0c9570adbc49ff09c648282a0a0", "ConsortiumChanged(address,address)", {"prevVal": indexed(p.address), "newVal": indexed(p.address)}),
    DustFeeRateChanged: event("0x78739e78c1e8bc1416322baf73f3397a683d656e9425f621050e243dc73ea03d", "DustFeeRateChanged(uint256,uint256)", {"oldRate": indexed(p.uint256), "newRate": indexed(p.uint256)}),
    EIP712DomainChanged: event("0x0a6387c9ea3628b88a633bb4f3b151770f70085117a15f9bf3787cda53f13d31", "EIP712DomainChanged()", {}),
    FeeChanged: event("0x5fc463da23c1b063e66f9e352006a7fbe8db7223c455dc429e881a2dfe2f94f1", "FeeChanged(uint256,uint256)", {"oldFee": indexed(p.uint256), "newFee": indexed(p.uint256)}),
    FeeCharged: event("0xcd0d4a9ad4b364951764307d0ae7b0d2ea482965b258e2e2452ef396c53b20f0", "FeeCharged(uint256,bytes)", {"fee": indexed(p.uint256), "userSignature": p.bytes}),
    Initialized: event("0xc7f505b2f371ae2175ee4913f4499e1f2633a7b5936321eed1cdaeb6115181d2", "Initialized(uint64)", {"version": p.uint64}),
    MintProofConsumed: event("0x91f5c148b0f5ac9ddafe7030867f0d968adec49652c7ea760cf51fa233424b14", "MintProofConsumed(address,bytes32,bytes)", {"recipient": indexed(p.address), "payloadHash": indexed(p.bytes32), "payload": p.bytes}),
    MinterUpdated: event("0xb21afb9ce9be0a676f8f317ff0ca072fb89a4f8ce2d1b6fe80f8755c14f1cb19", "MinterUpdated(address,bool)", {"minter": indexed(p.address), "isMinter": p.bool}),
    NameAndSymbolChanged: event("0x4d807d72b2a493ff2c4e338967d3f82d3352481258457d12a4506a1762a44c69", "NameAndSymbolChanged(string,string)", {"name": p.string, "symbol": p.string}),
    OperatorRoleTransferred: event("0xd90d696290df8da2e089fb9f5467201dc45d6fa26d4d8e7c8a239b745f510c6c", "OperatorRoleTransferred(address,address)", {"previousOperator": indexed(p.address), "newOperator": indexed(p.address)}),
    OwnershipTransferStarted: event("0x38d16b8cac22d99fc7c124b9cd0de2d3fa1faef420bfe791d8c362d765e22700", "OwnershipTransferStarted(address,address)", {"previousOwner": indexed(p.address), "newOwner": indexed(p.address)}),
    OwnershipTransferred: event("0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", "OwnershipTransferred(address,address)", {"previousOwner": indexed(p.address), "newOwner": indexed(p.address)}),
    Paused: event("0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258", "Paused(address)", {"account": p.address}),
    PauserRoleTransferred: event("0xfb34c91b8734ef26ee8085a0fa11d2692042c6edac57dc40d8850cad2f1bc3ef", "PauserRoleTransferred(address,address)", {"previousPauser": indexed(p.address), "newPauser": indexed(p.address)}),
    Transfer: event("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "Transfer(address,address,uint256)", {"from": indexed(p.address), "to": indexed(p.address), "value": p.uint256}),
    TreasuryAddressChanged: event("0x4fc6e7a37aea21888550b60360992adb6a9b3b4da644d63e9f3a420c2d86e282", "TreasuryAddressChanged(address,address)", {"prevValue": indexed(p.address), "newValue": indexed(p.address)}),
    Unpaused: event("0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa", "Unpaused(address)", {"account": p.address}),
    UnstakeRequest: event("0x48396c786750ed570cc1b02085ad1b3c1ffb59fd39686c23a263c1e0d974af1b", "UnstakeRequest(address,bytes,uint256)", {"fromAddress": indexed(p.address), "scriptPubKey": p.bytes, "amount": p.uint256}),
    WithdrawalsEnabled: event("0x45e7e6146471a396eb58b618e88efd46f5c95bd1815b282ed75c5220a559ab10", "WithdrawalsEnabled(bool)", {"_0": p.bool}),
}

export const functions = {
    Bascule: viewFun("0xd6a02b6a", "Bascule()", {}, p.address),
    DOMAIN_SEPARATOR: viewFun("0x3644e515", "DOMAIN_SEPARATOR()", {}, p.bytes32),
    acceptOwnership: fun("0x79ba5097", "acceptOwnership()", {}, ),
    addClaimer: fun("0x2ea66401", "addClaimer(address)", {"newClaimer": p.address}, ),
    addMinter: fun("0x983b2d56", "addMinter(address)", {"newMinter": p.address}, ),
    allowance: viewFun("0xdd62ed3e", "allowance(address,address)", {"owner": p.address, "spender": p.address}, p.uint256),
    approve: fun("0x095ea7b3", "approve(address,uint256)", {"spender": p.address, "value": p.uint256}, p.bool),
    balanceOf: viewFun("0x70a08231", "balanceOf(address)", {"account": p.address}, p.uint256),
    'batchMint(address[],uint256[])': fun("0x68573107", "batchMint(address[],uint256[])", {"to": p.array(p.address), "amount": p.array(p.uint256)}, ),
    'batchMint(bytes[],bytes[])': fun("0x9b914470", "batchMint(bytes[],bytes[])", {"payload": p.array(p.bytes), "proof": p.array(p.bytes)}, ),
    batchMintWithFee: fun("0x59aae4ba", "batchMintWithFee(bytes[],bytes[],bytes[],bytes[])", {"mintPayload": p.array(p.bytes), "proof": p.array(p.bytes), "feePayload": p.array(p.bytes), "userSignature": p.array(p.bytes)}, ),
    'burn(uint256)': fun("0x42966c68", "burn(uint256)", {"amount": p.uint256}, ),
    'burn(address,uint256)': fun("0x9dc29fac", "burn(address,uint256)", {"from": p.address, "amount": p.uint256}, ),
    calcUnstakeRequestAmount: viewFun("0x80e787df", "calcUnstakeRequestAmount(bytes,uint256)", {"scriptPubkey": p.bytes, "amount": p.uint256}, {"amountAfterFee": p.uint256, "isAboveDust": p.bool}),
    changeBascule: fun("0x7f56945e", "changeBascule(address)", {"newVal": p.address}, ),
    changeBurnCommission: fun("0xe3248f9a", "changeBurnCommission(uint64)", {"newValue": p.uint64}, ),
    changeConsortium: fun("0x56712139", "changeConsortium(address)", {"newVal": p.address}, ),
    changeDustFeeRate: fun("0x01d40387", "changeDustFeeRate(uint256)", {"newRate": p.uint256}, ),
    changeNameAndSymbol: fun("0x089bb99a", "changeNameAndSymbol(string,string)", {"name_": p.string, "symbol_": p.string}, ),
    changeTreasuryAddress: fun("0xa6f353f0", "changeTreasuryAddress(address)", {"newValue": p.address}, ),
    consortium: viewFun("0x9ad18765", "consortium()", {}, p.address),
    decimals: viewFun("0x313ce567", "decimals()", {}, p.uint8),
    eip712Domain: viewFun("0x84b0196e", "eip712Domain()", {}, {"fields": p.bytes1, "name": p.string, "version": p.string, "chainId": p.uint256, "verifyingContract": p.address, "salt": p.bytes32, "extensions": p.array(p.uint256)}),
    getBurnCommission: viewFun("0xf216acfb", "getBurnCommission()", {}, p.uint64),
    getDustFeeRate: viewFun("0x1721c6bc", "getDustFeeRate()", {}, p.uint256),
    getMintFee: viewFun("0x7a5caab3", "getMintFee()", {}, p.uint256),
    getTreasury: viewFun("0x3b19e84a", "getTreasury()", {}, p.address),
    initialize: fun("0x6294c311", "initialize(address,uint64,address,address)", {"consortium_": p.address, "burnCommission_": p.uint64, "treasury": p.address, "owner_": p.address}, ),
    isClaimer: viewFun("0x10a8aecd", "isClaimer(address)", {"claimer": p.address}, p.bool),
    isMinter: viewFun("0xaa271e1a", "isMinter(address)", {"minter": p.address}, p.bool),
    'mint(address,uint256)': fun("0x40c10f19", "mint(address,uint256)", {"to": p.address, "amount": p.uint256}, ),
    'mint(bytes,bytes)': fun("0x6bc63893", "mint(bytes,bytes)", {"payload": p.bytes, "proof": p.bytes}, ),
    mintWithFee: fun("0x06689495", "mintWithFee(bytes,bytes,bytes,bytes)", {"mintPayload": p.bytes, "proof": p.bytes, "feePayload": p.bytes, "userSignature": p.bytes}, ),
    name: viewFun("0x06fdde03", "name()", {}, p.string),
    nonces: viewFun("0x7ecebe00", "nonces(address)", {"owner": p.address}, p.uint256),
    operator: viewFun("0x570ca735", "operator()", {}, p.address),
    owner: viewFun("0x8da5cb5b", "owner()", {}, p.address),
    pause: fun("0x8456cb59", "pause()", {}, ),
    paused: viewFun("0x5c975abb", "paused()", {}, p.bool),
    pauser: viewFun("0x9fd0506d", "pauser()", {}, p.address),
    pendingOwner: viewFun("0xe30c3978", "pendingOwner()", {}, p.address),
    permit: fun("0xd505accf", "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", {"owner": p.address, "spender": p.address, "value": p.uint256, "deadline": p.uint256, "v": p.uint8, "r": p.bytes32, "s": p.bytes32}, ),
    redeem: fun("0xa3622bf0", "redeem(bytes,uint256)", {"scriptPubkey": p.bytes, "amount": p.uint256}, ),
    reinitialize: fun("0x6c2eb350", "reinitialize()", {}, ),
    removeClaimer: fun("0xf0490b8a", "removeClaimer(address)", {"oldClaimer": p.address}, ),
    removeMinter: fun("0x3092afd5", "removeMinter(address)", {"oldMinter": p.address}, ),
    renounceOwnership: fun("0x715018a6", "renounceOwnership()", {}, ),
    setMintFee: fun("0xeddd0d9c", "setMintFee(uint256)", {"fee": p.uint256}, ),
    symbol: viewFun("0x95d89b41", "symbol()", {}, p.string),
    toggleWithdrawals: fun("0xd239f003", "toggleWithdrawals()", {}, ),
    totalSupply: viewFun("0x18160ddd", "totalSupply()", {}, p.uint256),
    transfer: fun("0xa9059cbb", "transfer(address,uint256)", {"to": p.address, "value": p.uint256}, p.bool),
    transferFrom: fun("0x23b872dd", "transferFrom(address,address,uint256)", {"from": p.address, "to": p.address, "value": p.uint256}, p.bool),
    transferOperatorRole: fun("0x0d121337", "transferOperatorRole(address)", {"newOperator": p.address}, ),
    transferOwnership: fun("0xf2fde38b", "transferOwnership(address)", {"newOwner": p.address}, ),
    transferPauserRole: fun("0xbad383a6", "transferPauserRole(address)", {"newPauser": p.address}, ),
    unpause: fun("0x3f4ba83a", "unpause()", {}, ),
}

export class Contract extends ContractBase {

    Bascule() {
        return this.eth_call(functions.Bascule, {})
    }

    DOMAIN_SEPARATOR() {
        return this.eth_call(functions.DOMAIN_SEPARATOR, {})
    }

    allowance(owner: AllowanceParams["owner"], spender: AllowanceParams["spender"]) {
        return this.eth_call(functions.allowance, {owner, spender})
    }

    balanceOf(account: BalanceOfParams["account"]) {
        return this.eth_call(functions.balanceOf, {account})
    }

    calcUnstakeRequestAmount(scriptPubkey: CalcUnstakeRequestAmountParams["scriptPubkey"], amount: CalcUnstakeRequestAmountParams["amount"]) {
        return this.eth_call(functions.calcUnstakeRequestAmount, {scriptPubkey, amount})
    }

    consortium() {
        return this.eth_call(functions.consortium, {})
    }

    decimals() {
        return this.eth_call(functions.decimals, {})
    }

    eip712Domain() {
        return this.eth_call(functions.eip712Domain, {})
    }

    getBurnCommission() {
        return this.eth_call(functions.getBurnCommission, {})
    }

    getDustFeeRate() {
        return this.eth_call(functions.getDustFeeRate, {})
    }

    getMintFee() {
        return this.eth_call(functions.getMintFee, {})
    }

    getTreasury() {
        return this.eth_call(functions.getTreasury, {})
    }

    isClaimer(claimer: IsClaimerParams["claimer"]) {
        return this.eth_call(functions.isClaimer, {claimer})
    }

    isMinter(minter: IsMinterParams["minter"]) {
        return this.eth_call(functions.isMinter, {minter})
    }

    name() {
        return this.eth_call(functions.name, {})
    }

    nonces(owner: NoncesParams["owner"]) {
        return this.eth_call(functions.nonces, {owner})
    }

    operator() {
        return this.eth_call(functions.operator, {})
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

    pendingOwner() {
        return this.eth_call(functions.pendingOwner, {})
    }

    symbol() {
        return this.eth_call(functions.symbol, {})
    }

    totalSupply() {
        return this.eth_call(functions.totalSupply, {})
    }
}

/// Event types
export type ApprovalEventArgs = EParams<typeof events.Approval>
export type BasculeChangedEventArgs = EParams<typeof events.BasculeChanged>
export type BatchMintSkippedEventArgs = EParams<typeof events.BatchMintSkipped>
export type BridgeChangedEventArgs = EParams<typeof events.BridgeChanged>
export type BurnCommissionChangedEventArgs = EParams<typeof events.BurnCommissionChanged>
export type ClaimerUpdatedEventArgs = EParams<typeof events.ClaimerUpdated>
export type ConsortiumChangedEventArgs = EParams<typeof events.ConsortiumChanged>
export type DustFeeRateChangedEventArgs = EParams<typeof events.DustFeeRateChanged>
export type EIP712DomainChangedEventArgs = EParams<typeof events.EIP712DomainChanged>
export type FeeChangedEventArgs = EParams<typeof events.FeeChanged>
export type FeeChargedEventArgs = EParams<typeof events.FeeCharged>
export type InitializedEventArgs = EParams<typeof events.Initialized>
export type MintProofConsumedEventArgs = EParams<typeof events.MintProofConsumed>
export type MinterUpdatedEventArgs = EParams<typeof events.MinterUpdated>
export type NameAndSymbolChangedEventArgs = EParams<typeof events.NameAndSymbolChanged>
export type OperatorRoleTransferredEventArgs = EParams<typeof events.OperatorRoleTransferred>
export type OwnershipTransferStartedEventArgs = EParams<typeof events.OwnershipTransferStarted>
export type OwnershipTransferredEventArgs = EParams<typeof events.OwnershipTransferred>
export type PausedEventArgs = EParams<typeof events.Paused>
export type PauserRoleTransferredEventArgs = EParams<typeof events.PauserRoleTransferred>
export type TransferEventArgs = EParams<typeof events.Transfer>
export type TreasuryAddressChangedEventArgs = EParams<typeof events.TreasuryAddressChanged>
export type UnpausedEventArgs = EParams<typeof events.Unpaused>
export type UnstakeRequestEventArgs = EParams<typeof events.UnstakeRequest>
export type WithdrawalsEnabledEventArgs = EParams<typeof events.WithdrawalsEnabled>

/// Function types
export type BasculeParams = FunctionArguments<typeof functions.Bascule>
export type BasculeReturn = FunctionReturn<typeof functions.Bascule>

export type DOMAIN_SEPARATORParams = FunctionArguments<typeof functions.DOMAIN_SEPARATOR>
export type DOMAIN_SEPARATORReturn = FunctionReturn<typeof functions.DOMAIN_SEPARATOR>

export type AcceptOwnershipParams = FunctionArguments<typeof functions.acceptOwnership>
export type AcceptOwnershipReturn = FunctionReturn<typeof functions.acceptOwnership>

export type AddClaimerParams = FunctionArguments<typeof functions.addClaimer>
export type AddClaimerReturn = FunctionReturn<typeof functions.addClaimer>

export type AddMinterParams = FunctionArguments<typeof functions.addMinter>
export type AddMinterReturn = FunctionReturn<typeof functions.addMinter>

export type AllowanceParams = FunctionArguments<typeof functions.allowance>
export type AllowanceReturn = FunctionReturn<typeof functions.allowance>

export type ApproveParams = FunctionArguments<typeof functions.approve>
export type ApproveReturn = FunctionReturn<typeof functions.approve>

export type BalanceOfParams = FunctionArguments<typeof functions.balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof functions.balanceOf>

export type BatchMintParams_0 = FunctionArguments<typeof functions['batchMint(address[],uint256[])']>
export type BatchMintReturn_0 = FunctionReturn<typeof functions['batchMint(address[],uint256[])']>

export type BatchMintParams_1 = FunctionArguments<typeof functions['batchMint(bytes[],bytes[])']>
export type BatchMintReturn_1 = FunctionReturn<typeof functions['batchMint(bytes[],bytes[])']>

export type BatchMintWithFeeParams = FunctionArguments<typeof functions.batchMintWithFee>
export type BatchMintWithFeeReturn = FunctionReturn<typeof functions.batchMintWithFee>

export type BurnParams_0 = FunctionArguments<typeof functions['burn(uint256)']>
export type BurnReturn_0 = FunctionReturn<typeof functions['burn(uint256)']>

export type BurnParams_1 = FunctionArguments<typeof functions['burn(address,uint256)']>
export type BurnReturn_1 = FunctionReturn<typeof functions['burn(address,uint256)']>

export type CalcUnstakeRequestAmountParams = FunctionArguments<typeof functions.calcUnstakeRequestAmount>
export type CalcUnstakeRequestAmountReturn = FunctionReturn<typeof functions.calcUnstakeRequestAmount>

export type ChangeBasculeParams = FunctionArguments<typeof functions.changeBascule>
export type ChangeBasculeReturn = FunctionReturn<typeof functions.changeBascule>

export type ChangeBurnCommissionParams = FunctionArguments<typeof functions.changeBurnCommission>
export type ChangeBurnCommissionReturn = FunctionReturn<typeof functions.changeBurnCommission>

export type ChangeConsortiumParams = FunctionArguments<typeof functions.changeConsortium>
export type ChangeConsortiumReturn = FunctionReturn<typeof functions.changeConsortium>

export type ChangeDustFeeRateParams = FunctionArguments<typeof functions.changeDustFeeRate>
export type ChangeDustFeeRateReturn = FunctionReturn<typeof functions.changeDustFeeRate>

export type ChangeNameAndSymbolParams = FunctionArguments<typeof functions.changeNameAndSymbol>
export type ChangeNameAndSymbolReturn = FunctionReturn<typeof functions.changeNameAndSymbol>

export type ChangeTreasuryAddressParams = FunctionArguments<typeof functions.changeTreasuryAddress>
export type ChangeTreasuryAddressReturn = FunctionReturn<typeof functions.changeTreasuryAddress>

export type ConsortiumParams = FunctionArguments<typeof functions.consortium>
export type ConsortiumReturn = FunctionReturn<typeof functions.consortium>

export type DecimalsParams = FunctionArguments<typeof functions.decimals>
export type DecimalsReturn = FunctionReturn<typeof functions.decimals>

export type Eip712DomainParams = FunctionArguments<typeof functions.eip712Domain>
export type Eip712DomainReturn = FunctionReturn<typeof functions.eip712Domain>

export type GetBurnCommissionParams = FunctionArguments<typeof functions.getBurnCommission>
export type GetBurnCommissionReturn = FunctionReturn<typeof functions.getBurnCommission>

export type GetDustFeeRateParams = FunctionArguments<typeof functions.getDustFeeRate>
export type GetDustFeeRateReturn = FunctionReturn<typeof functions.getDustFeeRate>

export type GetMintFeeParams = FunctionArguments<typeof functions.getMintFee>
export type GetMintFeeReturn = FunctionReturn<typeof functions.getMintFee>

export type GetTreasuryParams = FunctionArguments<typeof functions.getTreasury>
export type GetTreasuryReturn = FunctionReturn<typeof functions.getTreasury>

export type InitializeParams = FunctionArguments<typeof functions.initialize>
export type InitializeReturn = FunctionReturn<typeof functions.initialize>

export type IsClaimerParams = FunctionArguments<typeof functions.isClaimer>
export type IsClaimerReturn = FunctionReturn<typeof functions.isClaimer>

export type IsMinterParams = FunctionArguments<typeof functions.isMinter>
export type IsMinterReturn = FunctionReturn<typeof functions.isMinter>

export type MintParams_0 = FunctionArguments<typeof functions['mint(address,uint256)']>
export type MintReturn_0 = FunctionReturn<typeof functions['mint(address,uint256)']>

export type MintParams_1 = FunctionArguments<typeof functions['mint(bytes,bytes)']>
export type MintReturn_1 = FunctionReturn<typeof functions['mint(bytes,bytes)']>

export type MintWithFeeParams = FunctionArguments<typeof functions.mintWithFee>
export type MintWithFeeReturn = FunctionReturn<typeof functions.mintWithFee>

export type NameParams = FunctionArguments<typeof functions.name>
export type NameReturn = FunctionReturn<typeof functions.name>

export type NoncesParams = FunctionArguments<typeof functions.nonces>
export type NoncesReturn = FunctionReturn<typeof functions.nonces>

export type OperatorParams = FunctionArguments<typeof functions.operator>
export type OperatorReturn = FunctionReturn<typeof functions.operator>

export type OwnerParams = FunctionArguments<typeof functions.owner>
export type OwnerReturn = FunctionReturn<typeof functions.owner>

export type PauseParams = FunctionArguments<typeof functions.pause>
export type PauseReturn = FunctionReturn<typeof functions.pause>

export type PausedParams = FunctionArguments<typeof functions.paused>
export type PausedReturn = FunctionReturn<typeof functions.paused>

export type PauserParams = FunctionArguments<typeof functions.pauser>
export type PauserReturn = FunctionReturn<typeof functions.pauser>

export type PendingOwnerParams = FunctionArguments<typeof functions.pendingOwner>
export type PendingOwnerReturn = FunctionReturn<typeof functions.pendingOwner>

export type PermitParams = FunctionArguments<typeof functions.permit>
export type PermitReturn = FunctionReturn<typeof functions.permit>

export type RedeemParams = FunctionArguments<typeof functions.redeem>
export type RedeemReturn = FunctionReturn<typeof functions.redeem>

export type ReinitializeParams = FunctionArguments<typeof functions.reinitialize>
export type ReinitializeReturn = FunctionReturn<typeof functions.reinitialize>

export type RemoveClaimerParams = FunctionArguments<typeof functions.removeClaimer>
export type RemoveClaimerReturn = FunctionReturn<typeof functions.removeClaimer>

export type RemoveMinterParams = FunctionArguments<typeof functions.removeMinter>
export type RemoveMinterReturn = FunctionReturn<typeof functions.removeMinter>

export type RenounceOwnershipParams = FunctionArguments<typeof functions.renounceOwnership>
export type RenounceOwnershipReturn = FunctionReturn<typeof functions.renounceOwnership>

export type SetMintFeeParams = FunctionArguments<typeof functions.setMintFee>
export type SetMintFeeReturn = FunctionReturn<typeof functions.setMintFee>

export type SymbolParams = FunctionArguments<typeof functions.symbol>
export type SymbolReturn = FunctionReturn<typeof functions.symbol>

export type ToggleWithdrawalsParams = FunctionArguments<typeof functions.toggleWithdrawals>
export type ToggleWithdrawalsReturn = FunctionReturn<typeof functions.toggleWithdrawals>

export type TotalSupplyParams = FunctionArguments<typeof functions.totalSupply>
export type TotalSupplyReturn = FunctionReturn<typeof functions.totalSupply>

export type TransferParams = FunctionArguments<typeof functions.transfer>
export type TransferReturn = FunctionReturn<typeof functions.transfer>

export type TransferFromParams = FunctionArguments<typeof functions.transferFrom>
export type TransferFromReturn = FunctionReturn<typeof functions.transferFrom>

export type TransferOperatorRoleParams = FunctionArguments<typeof functions.transferOperatorRole>
export type TransferOperatorRoleReturn = FunctionReturn<typeof functions.transferOperatorRole>

export type TransferOwnershipParams = FunctionArguments<typeof functions.transferOwnership>
export type TransferOwnershipReturn = FunctionReturn<typeof functions.transferOwnership>

export type TransferPauserRoleParams = FunctionArguments<typeof functions.transferPauserRole>
export type TransferPauserRoleReturn = FunctionReturn<typeof functions.transferPauserRole>

export type UnpauseParams = FunctionArguments<typeof functions.unpause>
export type UnpauseReturn = FunctionReturn<typeof functions.unpause>

