import {
  Approval as ApprovalEvent,
  BasculeChanged as BasculeChangedEvent,
  BatchMintSkipped as BatchMintSkippedEvent,
  BridgeChanged as BridgeChangedEvent,
  BurnCommissionChanged as BurnCommissionChangedEvent,
  ClaimerUpdated as ClaimerUpdatedEvent,
  ConsortiumChanged as ConsortiumChangedEvent,
  DustFeeRateChanged as DustFeeRateChangedEvent,
  EIP712DomainChanged as EIP712DomainChangedEvent,
  FeeChanged as FeeChangedEvent,
  FeeCharged as FeeChargedEvent,
  Initialized as InitializedEvent,
  MintProofConsumed as MintProofConsumedEvent,
  MinterUpdated as MinterUpdatedEvent,
  NameAndSymbolChanged as NameAndSymbolChangedEvent,
  OperatorRoleTransferred as OperatorRoleTransferredEvent,
  OwnershipTransferStarted as OwnershipTransferStartedEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  Paused as PausedEvent,
  PauserRoleTransferred as PauserRoleTransferredEvent,
  Transfer as TransferEvent,
  TreasuryAddressChanged as TreasuryAddressChangedEvent,
  Unpaused as UnpausedEvent,
  UnstakeRequest as UnstakeRequestEvent,
  WithdrawalsEnabled as WithdrawalsEnabledEvent
} from "../generated/LBTC/LBTC"
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
} from "../generated/schema"

export function handleApproval(event: ApprovalEvent): void {
  let entity = new Approval(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBasculeChanged(event: BasculeChangedEvent): void {
  let entity = new BasculeChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.prevVal = event.params.prevVal
  entity.newVal = event.params.newVal

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBatchMintSkipped(event: BatchMintSkippedEvent): void {
  let entity = new BatchMintSkipped(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.payloadHash = event.params.payloadHash
  entity.payload = event.params.payload

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBridgeChanged(event: BridgeChangedEvent): void {
  let entity = new BridgeChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.prevVal = event.params.prevVal
  entity.newVal = event.params.newVal

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBurnCommissionChanged(
  event: BurnCommissionChangedEvent
): void {
  let entity = new BurnCommissionChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.prevValue = event.params.prevValue
  entity.newValue = event.params.newValue

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleClaimerUpdated(event: ClaimerUpdatedEvent): void {
  let entity = new ClaimerUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.claimer = event.params.claimer
  entity.isClaimer = event.params.isClaimer

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleConsortiumChanged(event: ConsortiumChangedEvent): void {
  let entity = new ConsortiumChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.prevVal = event.params.prevVal
  entity.newVal = event.params.newVal

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleDustFeeRateChanged(event: DustFeeRateChangedEvent): void {
  let entity = new DustFeeRateChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldRate = event.params.oldRate
  entity.newRate = event.params.newRate

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleEIP712DomainChanged(
  event: EIP712DomainChangedEvent
): void {
  let entity = new EIP712DomainChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleFeeChanged(event: FeeChangedEvent): void {
  let entity = new FeeChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldFee = event.params.oldFee
  entity.newFee = event.params.newFee

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleFeeCharged(event: FeeChargedEvent): void {
  let entity = new FeeCharged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.fee = event.params.fee
  entity.userSignature = event.params.userSignature

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleInitialized(event: InitializedEvent): void {
  let entity = new Initialized(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.version = event.params.version

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMintProofConsumed(event: MintProofConsumedEvent): void {
  let entity = new MintProofConsumed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.recipient = event.params.recipient
  entity.payloadHash = event.params.payloadHash
  entity.payload = event.params.payload

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMinterUpdated(event: MinterUpdatedEvent): void {
  let entity = new MinterUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.minter = event.params.minter
  entity.isMinter = event.params.isMinter

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNameAndSymbolChanged(
  event: NameAndSymbolChangedEvent
): void {
  let entity = new NameAndSymbolChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.name = event.params.name
  entity.symbol = event.params.symbol

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOperatorRoleTransferred(
  event: OperatorRoleTransferredEvent
): void {
  let entity = new OperatorRoleTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOperator = event.params.previousOperator
  entity.newOperator = event.params.newOperator

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnershipTransferStarted(
  event: OwnershipTransferStartedEvent
): void {
  let entity = new OwnershipTransferStarted(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnershipTransferred(
  event: OwnershipTransferredEvent
): void {
  let entity = new OwnershipTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousOwner = event.params.previousOwner
  entity.newOwner = event.params.newOwner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePaused(event: PausedEvent): void {
  let entity = new Paused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.account = event.params.account

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handlePauserRoleTransferred(
  event: PauserRoleTransferredEvent
): void {
  let entity = new PauserRoleTransferred(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.previousPauser = event.params.previousPauser
  entity.newPauser = event.params.newPauser

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.from = event.params.from
  entity.to = event.params.to
  entity.value = event.params.value

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTreasuryAddressChanged(
  event: TreasuryAddressChangedEvent
): void {
  let entity = new TreasuryAddressChanged(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.prevValue = event.params.prevValue
  entity.newValue = event.params.newValue

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleUnpaused(event: UnpausedEvent): void {
  let entity = new Unpaused(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.account = event.params.account

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleUnstakeRequest(event: UnstakeRequestEvent): void {
  let entity = new UnstakeRequest(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.fromAddress = event.params.fromAddress
  entity.scriptPubKey = event.params.scriptPubKey
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleWithdrawalsEnabled(event: WithdrawalsEnabledEvent): void {
  let entity = new WithdrawalsEnabled(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.param0 = event.params.param0

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
