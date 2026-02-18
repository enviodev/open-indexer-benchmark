import {
  Transfer as TransferEvent,
  LBTC as LBTCContract
} from "../generated/case_2_lbtc_full/LBTC"
import { Accounts, Snapshot, AccountRegistry, Transfer as TransferEntity } from "../generated/schema"
import { BigDecimal, BigInt, Address, ethereum, log } from "@graphprotocol/graph-ts"

// Define a class for snapshot data
class SnapshotData {
  point: BigDecimal
  balance: BigDecimal
  timestamp: BigInt
  mintAmount: BigDecimal

  constructor(
    point: BigDecimal,
    balance: BigDecimal,
    timestamp: BigInt,
    mintAmount: BigDecimal
  ) {
    this.point = point
    this.balance = balance
    this.timestamp = timestamp
    this.mintAmount = mintAmount
  }
}

// Helper function to add account to registry
function addAccountToRegistry(accountId: string, block: ethereum.Block): void {
  let registry = AccountRegistry.load("main")
  if (!registry) {
    registry = new AccountRegistry("main")
    registry.accounts = []
  }
  
  let accounts = registry.accounts
  let accountExists = false
  
  // Check if account already exists in registry
  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i] == accountId) {
      accountExists = true
      break
    }
  }
  
  // Add account if it doesn't exist
  if (!accountExists) {
    accounts.push(accountId)
    registry.accounts = accounts
    registry.save()
  }
}

// Helper to get the last snapshot data for an account
function getLastSnapshotData(accountId: string, timestamp: BigInt, block: ethereum.Block): SnapshotData {
  let lastPoint = BigDecimal.fromString("0")
  let lastBalance = BigDecimal.fromString("0")
  let lastTimestamp = BigInt.fromI32(0)
  let lastMintAmount = BigDecimal.fromString("0")

  let account = Accounts.load(accountId)
  if (account && account.lastSnapshotTimestamp) {
    lastTimestamp = account.lastSnapshotTimestamp
    
    // If we have a previous snapshot, load it
    if (lastTimestamp != BigInt.fromI32(0)) {
      let lastSnapshot = Snapshot.load(accountId + "-" + lastTimestamp.toString())
      if (lastSnapshot) {
        // Use non-null assertion since we know these values exist in the schema
        lastPoint = lastSnapshot.point as BigDecimal
        lastBalance = lastSnapshot.balance as BigDecimal
        lastMintAmount = lastSnapshot.mintAmount as BigDecimal
      }
    }
  } 
  return new SnapshotData(
    lastPoint,
    lastBalance,
    lastTimestamp,
    lastMintAmount
  )
}

// Helper to create and save a new snapshot
function createAndSaveSnapshot(
  accountId: string, 
  timestamp: BigInt, 
  balance: BigDecimal, 
  lastPoint: BigDecimal, 
  lastBalance: BigDecimal, 
  lastTimestamp: BigInt,
  lastMintAmount: BigDecimal,
  block: ethereum.Block,
  isMint: boolean = false,
  mintAmount: BigInt = BigInt.fromI32(0)
): void {
  // Skip processing for zero address
  if (accountId === "0x0000000000000000000000000000000000000000") {
    return;
  }
  let account = Accounts.load(accountId)
  if (!account) {
    account = new Accounts(accountId)
    account.lastSnapshotTimestamp = BigInt.fromI32(0)
    // Add to registry
    addAccountToRegistry(accountId, block)
    account.save()
  }
  
  let snapshot = new Snapshot(accountId + "-" + timestamp.toString())
  
  snapshot.account = account.id
  snapshot.timestamp = timestamp
  
  // Handle mint amount if it's a mint transaction
  if (isMint) {
    snapshot.mintAmount = lastMintAmount.plus(BigDecimal.fromString(mintAmount.toString()))
  } else {
    snapshot.mintAmount = lastMintAmount
  }
  
  // Set balance directly from the input parameter
  snapshot.balance = balance
  
  // Calculate point based on previous values
  if (lastTimestamp != BigInt.fromI32(0)) {
    // Convert timestamps to seconds for calculation
    let timeDiff = timestamp.minus(lastTimestamp)
    let timeDiffInSeconds = timeDiff.toI32()
    
    // Calculate points per second (1000 points per day)
    let pointsPerSecond = BigDecimal.fromString("1000")
      .div(BigDecimal.fromString("24"))
      .div(BigDecimal.fromString("60"))
      .div(BigDecimal.fromString("60"))
    
    // Calculate new point value
    let pointValue = lastPoint
      .plus(lastBalance
        .times(pointsPerSecond)
        .times(BigDecimal.fromString(timeDiffInSeconds.toString())))
    
    snapshot.point = pointValue
  } else {
    snapshot.point = BigDecimal.fromString("0")
  }
  
  snapshot.save()
  
  // Update account's last snapshot timestamp
  account.lastSnapshotTimestamp = timestamp
  account.save()
}

// Helper function to batch balanceOf calls
function batchBalanceOf(
  lbtc: LBTCContract,
  addresses: Address[]
): Map<string, BigDecimal> {
  let balanceMap = new Map<string, BigDecimal>()
  if (addresses.length == 0) return balanceMap

  // Process addresses in batches of 50 to avoid RPC timeouts
  const BATCH_SIZE = 50
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    let batch = addresses.slice(i, i + BATCH_SIZE)
    
    // Process batch in parallel
    for (let j = 0; j < batch.length; j++) {
      let address = batch[j]
      let callResult = lbtc.try_balanceOf(address)
      if (!callResult.reverted) {
        let balance = BigDecimal.fromString(callResult.value.toString())
        balanceMap.set(address.toHexString(), balance)
      } else {
        balanceMap.set(address.toHexString(), BigDecimal.fromString("0"))
      }
    }
  }

  return balanceMap
}

export function handleTransfer(event: TransferEvent): void {
  let lbtc = LBTCContract.bind(event.address)
  
  // Create and save Transfer entity
  let transfer = new TransferEntity(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  transfer.from = event.params.from
  transfer.to = event.params.to
  transfer.value = event.params.value
  transfer.blockNumber = event.block.number
  transfer.blockTimestamp = event.block.timestamp
  transfer.transactionHash = event.transaction.hash
  transfer.save()
  
  // Collect addresses to query
  let addresses: Address[] = []
  if (event.params.to != Address.fromString("0x0000000000000000000000000000000000000000")) {
    addresses.push(event.params.to)
  }
  if (event.params.from != Address.fromString("0x0000000000000000000000000000000000000000")) {
    addresses.push(event.params.from)
  }
  
  // Batch get balances
  let balanceMap = batchBalanceOf(lbtc, addresses)
  
  // Handle "to" account
  let toLastData = getLastSnapshotData(event.params.to.toHexString(), event.block.timestamp, event.block)
  
  // Check if this is a mint (from address is zero)
  let isMint = event.params.from == Address.fromString("0x0000000000000000000000000000000000000000")
  
  if (event.params.to.toHexString() != "0x0000000000000000000000000000000000000000") {
    let toBalance = balanceMap.get(event.params.to.toHexString())
    if (toBalance) {
      createAndSaveSnapshot(
        event.params.to.toHexString(),
        event.block.timestamp,
        toBalance,
        toLastData.point,
        toLastData.balance,
        toLastData.timestamp,
        toLastData.mintAmount,
        event.block,
        isMint,
        event.params.value
      )
    }
  }
  
  // Handle "from" account (skip if it's a mint)
  if (!isMint) {
    let fromLastData = getLastSnapshotData(event.params.from.toHexString(), event.block.timestamp, event.block)
    let fromBalance = balanceMap.get(event.params.from.toHexString())
    if (fromBalance) {
      createAndSaveSnapshot(
        event.params.from.toHexString(),
        event.block.timestamp,
        fromBalance,
        fromLastData.point,
        fromLastData.balance,
        fromLastData.timestamp,
        fromLastData.mintAmount,
        event.block
      )
    }
  }
}

export function handleBlock(block: ethereum.Block): void {
  // Get all accounts from registry
  let registry = AccountRegistry.load("main")
  
  if (registry) {
    let accountIds = registry.accounts
    
    for (let i = 0; i < accountIds.length; i++) {
      let account = Accounts.load(accountIds[i])
      
      if (account) {
        // Get last snapshot data
        let lastData = getLastSnapshotData(account.id, block.timestamp, block)
        
        // Only create new snapshot if we have a previous one
        if (lastData.timestamp != BigInt.fromI32(0)) {
          // Use the stored balance from lastData since it hasn't changed
          createAndSaveSnapshot(
            account.id,
            block.timestamp,
            lastData.balance,
            lastData.point,
            lastData.balance,
            lastData.timestamp,
            lastData.mintAmount,
            block
          )
        }
      }
    }
  }
}