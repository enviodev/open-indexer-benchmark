import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  Approval,
  BasculeChanged,
  BatchMintSkipped,
  BridgeChanged,
  BurnCommissionChanged,
  ClaimerUpdated,
  ConsortiumChanged,
  DustFeeRateChanged,
  EIP712DomainChanged,
  FeeChanged,
  FeeCharged,
  Initialized,
  MintProofConsumed,
  MinterUpdated,
  NameAndSymbolChanged,
  OperatorRoleTransferred,
  OwnershipTransferStarted,
  OwnershipTransferred,
  Paused,
  PauserRoleTransferred,
  Transfer,
  TreasuryAddressChanged,
  Unpaused,
  UnstakeRequest,
  WithdrawalsEnabled
} from "../generated/LBTC/LBTC"

export function createApprovalEvent(
  owner: Address,
  spender: Address,
  value: BigInt
): Approval {
  let approvalEvent = changetype<Approval>(newMockEvent())

  approvalEvent.parameters = new Array()

  approvalEvent.parameters.push(
    new ethereum.EventParam("owner", ethereum.Value.fromAddress(owner))
  )
  approvalEvent.parameters.push(
    new ethereum.EventParam("spender", ethereum.Value.fromAddress(spender))
  )
  approvalEvent.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value))
  )

  return approvalEvent
}

export function createBasculeChangedEvent(
  prevVal: Address,
  newVal: Address
): BasculeChanged {
  let basculeChangedEvent = changetype<BasculeChanged>(newMockEvent())

  basculeChangedEvent.parameters = new Array()

  basculeChangedEvent.parameters.push(
    new ethereum.EventParam("prevVal", ethereum.Value.fromAddress(prevVal))
  )
  basculeChangedEvent.parameters.push(
    new ethereum.EventParam("newVal", ethereum.Value.fromAddress(newVal))
  )

  return basculeChangedEvent
}

export function createBatchMintSkippedEvent(
  payloadHash: Bytes,
  payload: Bytes
): BatchMintSkipped {
  let batchMintSkippedEvent = changetype<BatchMintSkipped>(newMockEvent())

  batchMintSkippedEvent.parameters = new Array()

  batchMintSkippedEvent.parameters.push(
    new ethereum.EventParam(
      "payloadHash",
      ethereum.Value.fromFixedBytes(payloadHash)
    )
  )
  batchMintSkippedEvent.parameters.push(
    new ethereum.EventParam("payload", ethereum.Value.fromBytes(payload))
  )

  return batchMintSkippedEvent
}

export function createBridgeChangedEvent(
  prevVal: Address,
  newVal: Address
): BridgeChanged {
  let bridgeChangedEvent = changetype<BridgeChanged>(newMockEvent())

  bridgeChangedEvent.parameters = new Array()

  bridgeChangedEvent.parameters.push(
    new ethereum.EventParam("prevVal", ethereum.Value.fromAddress(prevVal))
  )
  bridgeChangedEvent.parameters.push(
    new ethereum.EventParam("newVal", ethereum.Value.fromAddress(newVal))
  )

  return bridgeChangedEvent
}

export function createBurnCommissionChangedEvent(
  prevValue: BigInt,
  newValue: BigInt
): BurnCommissionChanged {
  let burnCommissionChangedEvent =
    changetype<BurnCommissionChanged>(newMockEvent())

  burnCommissionChangedEvent.parameters = new Array()

  burnCommissionChangedEvent.parameters.push(
    new ethereum.EventParam(
      "prevValue",
      ethereum.Value.fromUnsignedBigInt(prevValue)
    )
  )
  burnCommissionChangedEvent.parameters.push(
    new ethereum.EventParam(
      "newValue",
      ethereum.Value.fromUnsignedBigInt(newValue)
    )
  )

  return burnCommissionChangedEvent
}

export function createClaimerUpdatedEvent(
  claimer: Address,
  isClaimer: boolean
): ClaimerUpdated {
  let claimerUpdatedEvent = changetype<ClaimerUpdated>(newMockEvent())

  claimerUpdatedEvent.parameters = new Array()

  claimerUpdatedEvent.parameters.push(
    new ethereum.EventParam("claimer", ethereum.Value.fromAddress(claimer))
  )
  claimerUpdatedEvent.parameters.push(
    new ethereum.EventParam("isClaimer", ethereum.Value.fromBoolean(isClaimer))
  )

  return claimerUpdatedEvent
}

export function createConsortiumChangedEvent(
  prevVal: Address,
  newVal: Address
): ConsortiumChanged {
  let consortiumChangedEvent = changetype<ConsortiumChanged>(newMockEvent())

  consortiumChangedEvent.parameters = new Array()

  consortiumChangedEvent.parameters.push(
    new ethereum.EventParam("prevVal", ethereum.Value.fromAddress(prevVal))
  )
  consortiumChangedEvent.parameters.push(
    new ethereum.EventParam("newVal", ethereum.Value.fromAddress(newVal))
  )

  return consortiumChangedEvent
}

export function createDustFeeRateChangedEvent(
  oldRate: BigInt,
  newRate: BigInt
): DustFeeRateChanged {
  let dustFeeRateChangedEvent = changetype<DustFeeRateChanged>(newMockEvent())

  dustFeeRateChangedEvent.parameters = new Array()

  dustFeeRateChangedEvent.parameters.push(
    new ethereum.EventParam(
      "oldRate",
      ethereum.Value.fromUnsignedBigInt(oldRate)
    )
  )
  dustFeeRateChangedEvent.parameters.push(
    new ethereum.EventParam(
      "newRate",
      ethereum.Value.fromUnsignedBigInt(newRate)
    )
  )

  return dustFeeRateChangedEvent
}

export function createEIP712DomainChangedEvent(): EIP712DomainChanged {
  let eip712DomainChangedEvent = changetype<EIP712DomainChanged>(newMockEvent())

  eip712DomainChangedEvent.parameters = new Array()

  return eip712DomainChangedEvent
}

export function createFeeChangedEvent(
  oldFee: BigInt,
  newFee: BigInt
): FeeChanged {
  let feeChangedEvent = changetype<FeeChanged>(newMockEvent())

  feeChangedEvent.parameters = new Array()

  feeChangedEvent.parameters.push(
    new ethereum.EventParam("oldFee", ethereum.Value.fromUnsignedBigInt(oldFee))
  )
  feeChangedEvent.parameters.push(
    new ethereum.EventParam("newFee", ethereum.Value.fromUnsignedBigInt(newFee))
  )

  return feeChangedEvent
}

export function createFeeChargedEvent(
  fee: BigInt,
  userSignature: Bytes
): FeeCharged {
  let feeChargedEvent = changetype<FeeCharged>(newMockEvent())

  feeChargedEvent.parameters = new Array()

  feeChargedEvent.parameters.push(
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(fee))
  )
  feeChargedEvent.parameters.push(
    new ethereum.EventParam(
      "userSignature",
      ethereum.Value.fromBytes(userSignature)
    )
  )

  return feeChargedEvent
}

export function createInitializedEvent(version: BigInt): Initialized {
  let initializedEvent = changetype<Initialized>(newMockEvent())

  initializedEvent.parameters = new Array()

  initializedEvent.parameters.push(
    new ethereum.EventParam(
      "version",
      ethereum.Value.fromUnsignedBigInt(version)
    )
  )

  return initializedEvent
}

export function createMintProofConsumedEvent(
  recipient: Address,
  payloadHash: Bytes,
  payload: Bytes
): MintProofConsumed {
  let mintProofConsumedEvent = changetype<MintProofConsumed>(newMockEvent())

  mintProofConsumedEvent.parameters = new Array()

  mintProofConsumedEvent.parameters.push(
    new ethereum.EventParam("recipient", ethereum.Value.fromAddress(recipient))
  )
  mintProofConsumedEvent.parameters.push(
    new ethereum.EventParam(
      "payloadHash",
      ethereum.Value.fromFixedBytes(payloadHash)
    )
  )
  mintProofConsumedEvent.parameters.push(
    new ethereum.EventParam("payload", ethereum.Value.fromBytes(payload))
  )

  return mintProofConsumedEvent
}

export function createMinterUpdatedEvent(
  minter: Address,
  isMinter: boolean
): MinterUpdated {
  let minterUpdatedEvent = changetype<MinterUpdated>(newMockEvent())

  minterUpdatedEvent.parameters = new Array()

  minterUpdatedEvent.parameters.push(
    new ethereum.EventParam("minter", ethereum.Value.fromAddress(minter))
  )
  minterUpdatedEvent.parameters.push(
    new ethereum.EventParam("isMinter", ethereum.Value.fromBoolean(isMinter))
  )

  return minterUpdatedEvent
}

export function createNameAndSymbolChangedEvent(
  name: string,
  symbol: string
): NameAndSymbolChanged {
  let nameAndSymbolChangedEvent =
    changetype<NameAndSymbolChanged>(newMockEvent())

  nameAndSymbolChangedEvent.parameters = new Array()

  nameAndSymbolChangedEvent.parameters.push(
    new ethereum.EventParam("name", ethereum.Value.fromString(name))
  )
  nameAndSymbolChangedEvent.parameters.push(
    new ethereum.EventParam("symbol", ethereum.Value.fromString(symbol))
  )

  return nameAndSymbolChangedEvent
}

export function createOperatorRoleTransferredEvent(
  previousOperator: Address,
  newOperator: Address
): OperatorRoleTransferred {
  let operatorRoleTransferredEvent =
    changetype<OperatorRoleTransferred>(newMockEvent())

  operatorRoleTransferredEvent.parameters = new Array()

  operatorRoleTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOperator",
      ethereum.Value.fromAddress(previousOperator)
    )
  )
  operatorRoleTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "newOperator",
      ethereum.Value.fromAddress(newOperator)
    )
  )

  return operatorRoleTransferredEvent
}

export function createOwnershipTransferStartedEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferStarted {
  let ownershipTransferStartedEvent =
    changetype<OwnershipTransferStarted>(newMockEvent())

  ownershipTransferStartedEvent.parameters = new Array()

  ownershipTransferStartedEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferStartedEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferStartedEvent
}

export function createOwnershipTransferredEvent(
  previousOwner: Address,
  newOwner: Address
): OwnershipTransferred {
  let ownershipTransferredEvent =
    changetype<OwnershipTransferred>(newMockEvent())

  ownershipTransferredEvent.parameters = new Array()

  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousOwner",
      ethereum.Value.fromAddress(previousOwner)
    )
  )
  ownershipTransferredEvent.parameters.push(
    new ethereum.EventParam("newOwner", ethereum.Value.fromAddress(newOwner))
  )

  return ownershipTransferredEvent
}

export function createPausedEvent(account: Address): Paused {
  let pausedEvent = changetype<Paused>(newMockEvent())

  pausedEvent.parameters = new Array()

  pausedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )

  return pausedEvent
}

export function createPauserRoleTransferredEvent(
  previousPauser: Address,
  newPauser: Address
): PauserRoleTransferred {
  let pauserRoleTransferredEvent =
    changetype<PauserRoleTransferred>(newMockEvent())

  pauserRoleTransferredEvent.parameters = new Array()

  pauserRoleTransferredEvent.parameters.push(
    new ethereum.EventParam(
      "previousPauser",
      ethereum.Value.fromAddress(previousPauser)
    )
  )
  pauserRoleTransferredEvent.parameters.push(
    new ethereum.EventParam("newPauser", ethereum.Value.fromAddress(newPauser))
  )

  return pauserRoleTransferredEvent
}

export function createTransferEvent(
  from: Address,
  to: Address,
  value: BigInt
): Transfer {
  let transferEvent = changetype<Transfer>(newMockEvent())

  transferEvent.parameters = new Array()

  transferEvent.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to))
  )
  transferEvent.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value))
  )

  return transferEvent
}

export function createTreasuryAddressChangedEvent(
  prevValue: Address,
  newValue: Address
): TreasuryAddressChanged {
  let treasuryAddressChangedEvent =
    changetype<TreasuryAddressChanged>(newMockEvent())

  treasuryAddressChangedEvent.parameters = new Array()

  treasuryAddressChangedEvent.parameters.push(
    new ethereum.EventParam("prevValue", ethereum.Value.fromAddress(prevValue))
  )
  treasuryAddressChangedEvent.parameters.push(
    new ethereum.EventParam("newValue", ethereum.Value.fromAddress(newValue))
  )

  return treasuryAddressChangedEvent
}

export function createUnpausedEvent(account: Address): Unpaused {
  let unpausedEvent = changetype<Unpaused>(newMockEvent())

  unpausedEvent.parameters = new Array()

  unpausedEvent.parameters.push(
    new ethereum.EventParam("account", ethereum.Value.fromAddress(account))
  )

  return unpausedEvent
}

export function createUnstakeRequestEvent(
  fromAddress: Address,
  scriptPubKey: Bytes,
  amount: BigInt
): UnstakeRequest {
  let unstakeRequestEvent = changetype<UnstakeRequest>(newMockEvent())

  unstakeRequestEvent.parameters = new Array()

  unstakeRequestEvent.parameters.push(
    new ethereum.EventParam(
      "fromAddress",
      ethereum.Value.fromAddress(fromAddress)
    )
  )
  unstakeRequestEvent.parameters.push(
    new ethereum.EventParam(
      "scriptPubKey",
      ethereum.Value.fromBytes(scriptPubKey)
    )
  )
  unstakeRequestEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return unstakeRequestEvent
}

export function createWithdrawalsEnabledEvent(
  param0: boolean
): WithdrawalsEnabled {
  let withdrawalsEnabledEvent = changetype<WithdrawalsEnabled>(newMockEvent())

  withdrawalsEnabledEvent.parameters = new Array()

  withdrawalsEnabledEvent.parameters.push(
    new ethereum.EventParam("param0", ethereum.Value.fromBoolean(param0))
  )

  return withdrawalsEnabledEvent
}
