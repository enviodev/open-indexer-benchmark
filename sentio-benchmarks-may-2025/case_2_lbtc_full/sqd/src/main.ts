import {TypeormDatabase} from '@subsquid/typeorm-store'
import {Accounts, Snapshot, Transfer} from './model'
import {LBTC_PROXY, MULTICALL_ADDRESS} from "./constant.js"
import {processor} from './processor'
import {BigDecimal} from '@subsquid/big-decimal'
import {Contract, events, functions} from "./abi/LBTC.js"
import {Multicall} from "./abi/multicall.js"

// Add timer variables
let rpcTime = 0;
let pointCalcTime = 0;
let storageTime = 0;
const SECOND_PER_HOUR = 60n * 60n;
const DAILY_POINTS = 1000;

// Helper to get the last snapshot data
async function getLastSnapshotData(store: any, accountId: string): Promise<{
  point: BigDecimal,
  balance: BigDecimal,
  timestamp: bigint,
  mintAmount: BigDecimal
}> {
  let lastPoint = BigDecimal(0)
  let lastBalance = BigDecimal(0)
  let lastTimestamp = 0n
  let lastMintAmount = BigDecimal(0)
  
  const accountStartTime = performance.now();
  let account = await store.get(Accounts, accountId)
  storageTime += performance.now() - accountStartTime;
  if (account && account.lastSnapshotTimestamp) {
    lastTimestamp = BigInt(account.lastSnapshotTimestamp)
    
    // If we have a previous snapshot, load it
    if (lastTimestamp != 0n) {
      const snapshotStartTime = performance.now();
      let lastSnapshot = await store.get(Snapshot, `${accountId}-${lastTimestamp}`)
      storageTime += performance.now() - snapshotStartTime;
      if (lastSnapshot) {
        lastPoint = lastSnapshot.point || BigDecimal(0)
        lastBalance = lastSnapshot.balance
        lastMintAmount = lastSnapshot.mintAmount || BigDecimal(0)
      }
    }
  }
  
  return {
    point: lastPoint,
    balance: lastBalance,
    timestamp: lastTimestamp,
    mintAmount: lastMintAmount
  }
}

// Helper to check if it's time for an hourly update
async function shouldUpdateHourly(store: any, accountId: string, currentTimestamp: bigint): Promise<boolean> {
  const accountStartTime = performance.now();
  let account = await store.get(Accounts, accountId)
  storageTime += performance.now() - accountStartTime;
  if (!account) return false
  
  // Check if the account has a lastSnapshotTimestamp and if an hour has passed
  return account.lastSnapshotTimestamp > 0n && 
         (currentTimestamp - BigInt(account.lastSnapshotTimestamp)) >= SECOND_PER_HOUR
}

// Helper to create and save a snapshot
async function createAndSaveSnapshot(
  store: any,
  accountId: string, 
  timestamp: bigint,
  balance: BigDecimal,
  lastPoint: BigDecimal,
  lastBalance: BigDecimal,
  lastTimestamp: bigint,
  lastMintAmount: BigDecimal,
  snapshotsMap: Map<string, Snapshot>,
  accountsToUpdate: Map<string, Accounts>,
  isMint: boolean = false,
  mintAmount: bigint = 0n,
  triggerEvent: 'Transfer' | 'TimeInterval' = 'Transfer'
): Promise<void> {
    // Skip processing for zero address
    if (accountId === "0x0000000000000000000000000000000000000000") {
      return;
    }
  const snapshotKey = `${accountId}-${timestamp}`;
  
  // Get account from map if exists, otherwise from store
  let account: Accounts;
  const accountStartTime = performance.now();
  if (accountsToUpdate.has(accountId)) {
    account = accountsToUpdate.get(accountId)!;
  } else {
    account = await store.get(Accounts, accountId);
    if (!account) {
      account = new Accounts()
      account.id = accountId
      account.lastSnapshotTimestamp = 0n;
      const saveStartTime = performance.now();
      await store.save(account);
      storageTime += performance.now() - saveStartTime;
    }
  }
  storageTime += performance.now() - accountStartTime;
  
  // Get existing snapshot or create new one
  let snapshot: Snapshot;
  if (snapshotsMap.has(snapshotKey)) {
    const snapshotStartTime = performance.now();
    snapshot = snapshotsMap.get(snapshotKey)!;
    storageTime += performance.now() - snapshotStartTime;
    // Update the balance instead of skipping
    snapshot.balance = balance;
  } else {
    snapshot = new Snapshot()
    snapshot.id = snapshotKey
    snapshot.account = account
    snapshot.timestamp = timestamp
    snapshot.balance = balance
    snapshot.triggerEvent = triggerEvent
  }
  
  // Handle mint amount if it's a mint transaction
  if (isMint) {
    // If we already have a mintAmount, add to it
    snapshot.mintAmount = snapshot.mintAmount ? 
      snapshot.mintAmount.plus(BigDecimal(mintAmount.toString())) : 
      lastMintAmount.plus(BigDecimal(mintAmount.toString()));
  } else if (!snapshot.mintAmount) {
    // Only set mintAmount if not already set
    snapshot.mintAmount = lastMintAmount;
  }
  
  // Calculate point based on previous values
  if (lastTimestamp != 0n) {
    const pointCalcStartTime = performance.now();
    const secondsSinceLastUpdate = Number(BigInt(snapshot.timestamp) - lastTimestamp);
    snapshot.point = lastPoint.plus(
      lastBalance
        .times(BigDecimal(DAILY_POINTS/24))
        .times(BigDecimal(secondsSinceLastUpdate / Number(SECOND_PER_HOUR)))
    );
    pointCalcTime += performance.now() - pointCalcStartTime;
  } else if (!snapshot.point) {
    snapshot.point = BigDecimal(0);
  }
  
  // Update account's last snapshot timestamp
  account.lastSnapshotTimestamp = timestamp;
  
  // Add to maps
  snapshotsMap.set(snapshotKey, snapshot);
  accountsToUpdate.set(accountId, account);
}

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
    const transfers: Transfer[] = []
    // Use Maps for both snapshots and accounts to prevent duplicates
    const snapshotsMap = new Map<string, Snapshot>() // key: accountId-timestamp
    const accountsToUpdate = new Map<string, Accounts>()
    console.log(`Processing block ${ctx.blocks[0].header.height}, last block ${ctx.blocks[ctx.blocks.length - 1].header.height}`);
        
    for (let block of ctx.blocks) {
        let lbtc = new Contract({_chain: ctx._chain, block: block.header}, LBTC_PROXY)
        const blockTimestamp = BigInt(block.header.timestamp / 1000)
        
        // Collect all addresses that need balance queries for this block
        const addressesToQuery = new Set<string>();
        const blockTransfers: Transfer[] = [];
        
        // First pass: collect all addresses and transfers
        for (let log of block.logs) {
            if (log.topics[0] === events.Transfer.topic) {
                let {from, to, value} = events.Transfer.decode(log)
                
                const transfer = new Transfer()
                transfer.id = `${block.header.id}_${block.header.height}_${log.logIndex}`
                transfer.from = from
                transfer.to = to
                transfer.value = value
                transfer.blockNumber = BigInt(block.header.height)
                transfer.transactionHash = log.transaction?.hash ? Buffer.from(log.transaction.hash, 'hex') : undefined
                blockTransfers.push(transfer)

                if (from !== '0x0000000000000000000000000000000000000000') {
                    addressesToQuery.add(from);
                }
                if (to !== '0x0000000000000000000000000000000000000000') {
                    addressesToQuery.add(to);
                }
            }
        }

        // Add block transfers to the main transfers array
        transfers.push(...blockTransfers);

        // If we have addresses to query, do a single multicall for all of them
        if (addressesToQuery.size > 0) {
            const rpcStartTime = performance.now();
            const multicall = new Multicall({ _chain: ctx._chain, block: block.header }, MULTICALL_ADDRESS);
            const balances = await multicall.aggregate(
                functions.balanceOf,
                LBTC_PROXY,
                Array.from(addressesToQuery).map(addr => ({ account: addr })),
                1000 // batch size to avoid RPC timeouts
            );
            rpcTime += performance.now() - rpcStartTime;

            const balancesArray = balances.toString().split(',');
            const balanceMap = new Map(Array.from(addressesToQuery).map((addr, i) => [addr, balancesArray[i]]));

            // Second pass: process transfers and create snapshots
            for (const transfer of blockTransfers) {
                const {from, to, value} = transfer;
                
                if (from !== '0x0000000000000000000000000000000000000000') {
                    const fromBalance = balanceMap.get(from);
                    const lastData = await getLastSnapshotData(ctx.store, from);
                    await createAndSaveSnapshot(
                        ctx.store,
                        from,
                        blockTimestamp,
                        BigDecimal(fromBalance ? fromBalance : "0"),
                        lastData.point,
                        lastData.balance,
                        lastData.timestamp,
                        lastData.mintAmount,
                        snapshotsMap,
                        accountsToUpdate,
                        false,
                        undefined,
                        'Transfer'
                    );
                }

                if (to !== '0x0000000000000000000000000000000000000000') {
                    const toBalance = balanceMap.get(to);
                    const lastData = await getLastSnapshotData(ctx.store, to);
                    const isMint = from === '0x0000000000000000000000000000000000000000';
                    await createAndSaveSnapshot(
                        ctx.store,
                        to,
                        blockTimestamp,
                        BigDecimal(toBalance ? toBalance : "0"),
                        lastData.point,
                        lastData.balance,
                        lastData.timestamp,
                        lastData.mintAmount,
                        snapshotsMap,
                        accountsToUpdate,
                        isMint,
                        isMint ? value : undefined,
                        'Transfer'
                    );
                }
            }
        }
        
        // For the last block in the batch, process hourly updates for all accounts
        if (block === ctx.blocks[ctx.blocks.length - 1]) {
            const allAccounts = await ctx.store.find(Accounts, {});
            console.log(`Found ${allAccounts.length} accounts to update`);
            
            // Filter accounts that need hourly updates
            const accountsToUpdate = allAccounts.filter(account => 
                shouldUpdateHourly(ctx.store, account.id, blockTimestamp)
            );
            
            if (accountsToUpdate.length > 0) {
                // Create a Map for accounts to update
                const accountsToUpdateMap = new Map<string, Accounts>();
                accountsToUpdate.forEach(account => {
                    accountsToUpdateMap.set(account.id, account);
                });
                
                // Process each account using its stored balance
                for (const account of accountsToUpdate) {
                    const lastData = await getLastSnapshotData(ctx.store, account.id);
                    
                    await createAndSaveSnapshot(
                        ctx.store,
                        account.id,
                        blockTimestamp,
                        lastData.balance, // Use the stored balance
                        lastData.point,
                        lastData.balance,
                        lastData.timestamp,
                        lastData.mintAmount,
                        snapshotsMap,
                        accountsToUpdateMap,
                        false,
                        undefined,
                        'TimeInterval'
                    );
                }
            }
        }
    }
    
    // Batch save all entities at the end
    const storageStartTime = performance.now();
    await ctx.store.insert(transfers)
    if (snapshotsMap.size > 0) await ctx.store.save([...snapshotsMap.values()])
    if (accountsToUpdate.size > 0) await ctx.store.save([...accountsToUpdate.values()])
    storageTime += performance.now() - storageStartTime;
    
    ctx.log.info(`Performance metrics for block ${ctx.blocks[ctx.blocks.length - 1].header.height}: RPC balanceOf time: ${(rpcTime / 1000).toFixed(2)}s, Point calculation time: ${(pointCalcTime / 1000).toFixed(2)}s, Storage operation time: ${(storageTime / 1000).toFixed(2)}s`);
})
