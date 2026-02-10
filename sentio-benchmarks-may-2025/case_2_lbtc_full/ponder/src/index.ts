import { ponder } from "ponder:registry";
import schema from "ponder:schema";

// Add timer variables at the top
let rpcTime = 0;
let computeTime = 0;
let storageTime = 0;
let operationCount = 0;

// Multicall ABI for batch calls
const MULTICALL_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "callData",
        "type": "bytes"
      }
    ],
    "name": "call",
    "outputs": [
      {
        "internalType": "bool",
        "name": "success",
        "type": "bool"
      },
      {
        "internalType": "bytes",
        "name": "returnData",
        "type": "bytes"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Multicall address
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Helper function to batch balanceOf calls
async function batchBalanceOf(
  context: any,
  addresses: string[],
  lbtcAddress: string
): Promise<Map<string, bigint>> {
  const balanceMap = new Map<string, bigint>();
  if (addresses.length === 0) return balanceMap;

  // Batch call using multicall
  const rpcStartTime = performance.now();
  const results = await context.client.multicall({
    contracts: addresses.map(addr => ({
      address: lbtcAddress,
      abi: context.contracts.LBTC.abi,
      functionName: "balanceOf",
      args: [addr]
    }))
  });
  rpcTime += performance.now() - rpcStartTime;

  // Map results
  addresses.forEach((addr, i) => {
    balanceMap.set(addr, results[i].result);
  });

  return balanceMap;
}

// Event handler for Transfers
ponder.on("LBTC:Transfer", async ({ event, context }) => {
  const { from, to, value } = event.args;
  const timestamp = BigInt(event.block.timestamp);
  
  // Collections for batch operations
  const snapshots = new Map();
  const accountsToUpdate = new Map();
  
  // Collect addresses to query
  const addresses = new Set<string>();
  if (to !== "0x0000000000000000000000000000000000000000") addresses.add(to);
  if (from !== "0x0000000000000000000000000000000000000000") addresses.add(from);
  
  // Batch get balances
  const balanceMap = await batchBalanceOf(context, Array.from(addresses), context.contracts.LBTC.address);
  
  // Check if this is a mint
  const isMint = from === "0x0000000000000000000000000000000000000000";
  
  // Process "to" account
  await createAndSaveSnapshot( 
    context.db,
    to,
    timestamp,
    balanceMap.get(to) || 0n,
    snapshots,
    accountsToUpdate,
    true,
    isMint,
    value,
    event.transaction.hash
  );
  
  // Process "from" account (skip if mint)
  if (!isMint) {
    await createAndSaveSnapshot(
      context.db,
      from,
      timestamp,
      balanceMap.get(from) || 0n,
      snapshots,
      accountsToUpdate,
      true,
      false,
      0n,
      event.transaction.hash
    );
  }
  
  // Create transfer record
  const transferStartTime = performance.now();
  await context.db.insert(schema.lbtcTransfer).values({
    id: event.id,
    from,
    to,
    value,
    blockNumber: BigInt(event.block.number),
    transactionHash: event.transaction.hash
  });
  storageTime += performance.now() - transferStartTime;
  
  // Batch insert snapshots
  if (snapshots.size > 0) {
    const snapshotStartTime = performance.now();
    await context.db.insert(schema.snapshot)
      .values([...snapshots.values()])
      .onConflictDoUpdate((existing) => {
        const snapshot = snapshots.get(existing.id);
        if (!snapshot) return {};
        return {
          accountId: snapshot.accountId,
          balance: snapshot.balance,
          point: snapshot.point,
          mintAmount: snapshot.mintAmount,
          timestamp: snapshot.timestamp
        };
      });
    storageTime += performance.now() - snapshotStartTime;
  }
  
  // Batch insert/update accounts
  if (accountsToUpdate.size > 0) {
    const accountStartTime = performance.now();
    await context.db.insert(schema.accounts)
      .values([...accountsToUpdate.values()])
      .onConflictDoUpdate((existing) => {
        const account = accountsToUpdate.get(existing.id);
        if (!account) return {
          lastSnapshotTimestamp: existing.lastSnapshotTimestamp,
          balance: existing.balance,
          point: existing.point
        };
        return {
          lastSnapshotTimestamp: account.lastSnapshotTimestamp,
          balance: account.balance,
          point: account.point
        };
      });
    storageTime += performance.now() - accountStartTime;
  }

  operationCount++;
  if (operationCount % 1000 === 0) {
    console.log(`[${new Date().toISOString()}] Block ${event.block.number} - Ops: ${operationCount} - RPC: ${(rpcTime / 1000).toFixed(2)}s - Compute: ${(computeTime / 1000).toFixed(2)}s - Storage: ${(storageTime / 1000).toFixed(2)}s`);
  }
});

// Handle hourly updates with a trigger for block events
ponder.on("HourlyUpdate:block", async ({ event, context }) => {
  const storageStartTime = performance.now();
  const accounts = await context.db.sql.query.accounts.findMany();  
  storageTime += performance.now() - storageStartTime;
  
  const timestamp = BigInt(event.block.timestamp);
  
  // Collections for batch operations
  const snapshots = new Map();
  const accountsToUpdate = new Map();
  
  // Process all accounts
  for (const account of accounts) {
    // Only update accounts with existing snapshots
    if (account.lastSnapshotTimestamp !== 0n) {
      // Get current balance
      const balance = account.balance;
      await createAndSaveSnapshot(
        context.db,
        account.id,
        timestamp,
        balance,
        snapshots,
        accountsToUpdate,
        false,
        false,
        0n,
        `hourly-${event.block.number}`
      );
    }
  }
  
  // Validate snapshot objects before insertion
  const validSnapshots = [...snapshots.values()].filter(snapshot => 
    snapshot && snapshot.id && typeof snapshot.id === 'string'
  );
  
  // Batch insert snapshots - with conflict handling
  if (validSnapshots.length > 0) {
    const insertStartTime = performance.now();
    await context.db.insert(schema.snapshot)
      .values(validSnapshots)
      .onConflictDoUpdate((existing) => {
        const snapshot = snapshots.get(existing.id);
        if (!snapshot) {
          return {}; // No changes if snapshot not found
        }
        return {
          accountId: snapshot.accountId,  // match schema
          balance: snapshot.balance,
          point: snapshot.point,
          mintAmount: snapshot.mintAmount,
          timestamp: snapshot.timestamp
        };
      });
    storageTime += performance.now() - insertStartTime;
  }
  
  // Batch insert/update accounts
  if (accountsToUpdate.size > 0) {
    const insertStartTime = performance.now();
    await context.db.insert(schema.accounts)
      .values([...accountsToUpdate.values()])
      .onConflictDoUpdate((existing) => {
        const account = accountsToUpdate.get(existing.id);
        if (!account) {
          // If account not found in Map, return existing values
          return {
            lastSnapshotTimestamp: existing.lastSnapshotTimestamp
          };
        }
        return {
          lastSnapshotTimestamp: account.lastSnapshotTimestamp
        };
      });
    storageTime += performance.now() - insertStartTime;
  }
});

// Helper to get or create an account
async function getOrCreateAccount(db: any, address: string) {
  const accountId = address.toLowerCase();
  const storageStartTime = performance.now();
  const account = await db.find(schema.accounts, { id: accountId });
  storageTime += performance.now() - storageStartTime;
  if (!account) {
    // Create new account in both memory and database
    const insertStartTime = performance.now();
    await db.insert(schema.accounts).values({
      id: accountId,
      lastSnapshotTimestamp: 0n,
      balance: 0n,
      point: 0n
    });
    storageTime += performance.now() - insertStartTime;
    return { id: accountId, lastSnapshotTimestamp: 0n, balance: 0n, point: 0n };
  }
  
  return account;
}

// Helper to get the last snapshot data
async function getLastSnapshotData(db: any, accountId: string) {
  const defaultData = {
    point: 0n,
    balance: 0n,
    timestamp: 0n,
    mintAmount: 0n
  };
  
  // Measure storage time for account lookup
  const storageStartTime = performance.now();
  const account = await db.find(schema.accounts, { id: accountId });
  storageTime += performance.now() - storageStartTime;
  
  if (!account || !account.lastSnapshotTimestamp) return defaultData;
  
  // Measure storage time for snapshot lookup
  const snapshotStartTime = performance.now();
  const snapshotId = `${accountId}-${account.lastSnapshotTimestamp.toString()}`;
  const snapshot = await db.find(schema.snapshot, { id: snapshotId });
  storageTime += performance.now() - snapshotStartTime;
  
  if (snapshot) {
    return {
      point: snapshot.point || 0n,
      balance: snapshot.balance,
      timestamp: account.lastSnapshotTimestamp,
      mintAmount: snapshot.mintAmount || 0n
    };
  }
  
  return defaultData;
}

// Helper to create a new snapshot (modified to collect instead of save)
async function createAndSaveSnapshot(
  db: any,
  accountId: string,
  timestamp: bigint,
  balance: bigint,
  snapshots: Map<string, any>,
  accountsToUpdate: Map<string, any>,
  createIfNotExists = true,
  isMint = false,
  mintAmount = 0n,
  transactionHash = "0x0"
) {
  // Skip processing for zero address
  if (accountId === "0x0000000000000000000000000000000000000000") {
    return;
  }

  // Normalize account ID to lowercase
  const normalizedAccountId = accountId.toLowerCase();
  
  // Get or create account and last snapshot data
  if (createIfNotExists) {
    await getOrCreateAccount(db, normalizedAccountId);
  }
  const lastData = await getLastSnapshotData(db, normalizedAccountId);
  
  // Measure compute time for point calculations
  const computeStartTime = performance.now();
  const snapshotId = `${normalizedAccountId}-${timestamp.toString()}`;
  let newMintAmount = lastData.mintAmount;
  if (isMint) {
    newMintAmount = lastData.mintAmount + mintAmount;
  }
  
  let point = 0n;
  if (lastData.timestamp !== 0n) {
    const timeDiffSeconds = Number((timestamp - lastData.timestamp));
    const pointsToAdd = lastData.balance * BigInt(timeDiffSeconds) * 1000n / 60n / 60n / 24n;
    point = lastData.point + pointsToAdd;
  }
  computeTime += performance.now() - computeStartTime;
  
  // Get the full account object for proper relationship
  const accountStartTime = performance.now();
  const account = await db.find(schema.accounts, { id: normalizedAccountId });
  storageTime += performance.now() - accountStartTime;
  
  // Only proceed if we have a valid account
  if (account) {
    // Add snapshot to collection
    snapshots.set(snapshotId, {
      id: snapshotId,
      accountId: normalizedAccountId,
      timestamp: timestamp,
      balance: balance,  // Make sure we're using the RPC balance
      point: point,
      mintAmount: newMintAmount
    });
    // Add account update to collection
    accountsToUpdate.set(normalizedAccountId, {
      id: normalizedAccountId,
      lastSnapshotTimestamp: timestamp,
      balance: balance,  // Make sure we're using the RPC balance
      point: point
    });
  }
}
