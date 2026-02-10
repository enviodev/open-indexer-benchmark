/*
 * Please refer to https://docs.envio.dev for a thorough guide on all Envio indexer features
 */
import {
  LBTC,
  Transfer,
  BigDecimal,
  HandlerContext,
  Snapshot,
} from "generated";

import { getBalance } from "./util";

const SECOND_PER_HOUR = 60n * 60n;
const POINTS_PER_DAY = 1000;

LBTC.Transfer.handlerWithLoader({
  loader: ({ event, context }) => {
    const blockNumber = BigInt(event.block.number);
    const rpcStartTime = performance.now();
    return Promise.all([
      event.params.from !== "0x0000000000000000000000000000000000000000"
        ? context.effect(getBalance, {
            address: event.params.from,
            blockNumber: blockNumber,
          })
        : Promise.resolve(BigDecimal(0)),
      context.effect(getBalance, {
        address: event.params.to,
        blockNumber: blockNumber,
      }),
    ]);
  },
  handler: async ({
    event,
    context,
    loaderReturn,
  }: {
    event: any;
    context: HandlerContext;
    loaderReturn: any;
  }) => {
    const blockTimestamp = BigInt(event.block.timestamp);
    const blockNumber = BigInt(event.block.number);
    const [fromBalance, toBalance] = loaderReturn;

    let { from, to, value } = event.params;

    // Check for out-of-order transfers
    if (from !== "0x0000000000000000000000000000000000000000") {
      const fromAccount = await context.Accounts.get(from);

      const lastBlock = fromAccount?.lastProcessedBlock || 0n;
      if (blockNumber < lastBlock) {
        context.log.error(
          `\n[OUT_OF_ORDER TRANSFER DETECTED]\n` +
            `Account: ${from}\n` +
            `Current block: ${blockNumber}\n` +
            `Last processed block: ${lastBlock}\n` +
            `Block difference: ${lastBlock - blockNumber}\n` +
            `Current timestamp: ${blockTimestamp}\n` +
            `Transaction hash: ${event.transaction.hash}\n` +
            `Value: ${value}\n`
        );
      }
      // Update last processed block in database
      if (fromAccount) {
        context.Accounts.set({
          ...fromAccount,
          lastProcessedBlock: blockNumber,
        });
      }
    }

    const toAccount = await context.Accounts.get(to);

    const lastToBlock = toAccount?.lastProcessedBlock || 0n;
    if (blockNumber < lastToBlock) {
      context.log.error(
        `\n[OUT_OF_ORDER TRANSFER DETECTED]\n` +
          `Account: ${to}\n` +
          `Current block: ${blockNumber}\n` +
          `Last processed block: ${lastToBlock}\n` +
          `Block difference: ${lastToBlock - blockNumber}\n` +
          `Current timestamp: ${blockTimestamp}\n` +
          `Transaction hash: ${event.transaction.hash}\n` +
          `Value: ${value}\n`
      );
    }
    // Update last processed block in database
    if (toAccount) {
      context.Accounts.set({
        ...toAccount,
        lastProcessedBlock: blockNumber,
      });
    }

    const entity: Transfer = {
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
      from: from,
      to: to,
      value: value,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    };

    context.Transfer.set(entity);

    const isMint = from === "0x0000000000000000000000000000000000000000";

    // Process sender account
    if (!isMint) {
      const fromLastData = await getLastSnapshotData(context, from);

      await createAndSaveSnapshot(
        context,
        from,
        blockTimestamp,
        fromBalance,
        fromLastData.point,
        fromLastData.balance,
        fromLastData.timestamp,
        fromLastData.mintAmount
      );
    }

    // Process receiver account
    const toLastData = await getLastSnapshotData(context, to);

    await createAndSaveSnapshot(
      context,
      to,
      blockTimestamp,
      toBalance,
      toLastData.point,
      toLastData.balance,
      toLastData.timestamp,
      toLastData.mintAmount,
      isMint,
      value
    );

    const registry = await context.AccountRegistry.get("main");

    if (registry) {
      // Only run the global update if an hour has passed since the last global update
      if (
        !registry.lastSnapshotTimestamp ||
        blockTimestamp - registry.lastSnapshotTimestamp >= SECOND_PER_HOUR
      ) {
        // Update the global timestamp
        context.AccountRegistry.set({
          ...registry,
          lastSnapshotTimestamp: blockTimestamp,
        });

        // Get all accounts that need updating
        await Promise.all(
          registry.accounts.map(async (accountId: string) => {
            const account = await context.Accounts.get(accountId);
            if (!account) return;

            // Check if it's time for an hourly update for this specific account
            if (await shouldUpdateHourly(context, accountId, blockTimestamp)) {
              const lastData = await getLastSnapshotData(context, accountId);
              await createAndSaveSnapshot(
                context,
                accountId,
                blockTimestamp,
                lastData.balance,
                lastData.point,
                lastData.balance,
                lastData.timestamp,
                lastData.mintAmount
              );
            }
          })
        );
      }
    }
  },
});

// Helper function to add account to registry
async function addAccountToRegistry(
  context: any,
  accountId: string
): Promise<void> {
  let registry = await context.AccountRegistry.get("main");

  if (!registry) {
    registry = {
      id: "main",
      accounts: [],
      lastSnapshotTimestamp: 0n,
    };
  }

  let accountExists = registry.accounts.includes(accountId);

  // Add account if it doesn't exist
  if (!accountExists) {
    registry.accounts.push(accountId);
    await context.AccountRegistry.set(registry);
  }
}

// Helper to get the last snapshot data
async function getLastSnapshotData(
  context: any,
  accountId: string
): Promise<{
  point: BigDecimal;
  balance: BigDecimal;
  timestamp: bigint;
  mintAmount: BigDecimal;
}> {
  let lastPoint = BigDecimal(0);
  let lastBalance = BigDecimal(0);
  let lastTimestamp = 0n;
  let lastMintAmount = BigDecimal(0);

  let account = await context.Accounts.get(accountId);

  if (account && account.lastSnapshotTimestamp) {
    lastTimestamp = account.lastSnapshotTimestamp;

    // If we have a previous snapshot, load it
    if (lastTimestamp != 0n) {
      let lastSnapshot = await context.Snapshot.get(
        `${accountId}-${lastTimestamp}`
      );

      if (lastSnapshot) {
        lastPoint = lastSnapshot.point || BigDecimal(0);
        lastBalance = lastSnapshot.balance;
        lastMintAmount = lastSnapshot.mintAmount || BigDecimal(0);
      }
    }
  }

  return {
    point: lastPoint,
    balance: lastBalance,
    timestamp: lastTimestamp,
    mintAmount: lastMintAmount,
  };
}

// Helper to check if it's time for an hourly update
async function shouldUpdateHourly(
  context: any,
  accountId: string,
  currentTimestamp: bigint
): Promise<boolean> {
  let account = await context.Accounts.get(accountId);

  if (!account) return false;

  // Check if the account has a lastSnapshotTimestamp and if an hour has passed
  return (
    account.lastSnapshotTimestamp > 0n &&
    currentTimestamp - account.lastSnapshotTimestamp >= SECOND_PER_HOUR
  );
}

// Helper to create and save a snapshot
async function createAndSaveSnapshot(
  context: HandlerContext,
  accountId: string,
  timestamp: bigint,
  balance: BigDecimal,
  lastPoint: BigDecimal,
  lastBalance: BigDecimal,
  lastTimestamp: bigint,
  lastMintAmount: BigDecimal,
  isMint: boolean = false,
  mintAmount: bigint = 0n
): Promise<void> {
  // Skip processing for zero address
  if (accountId === "0x0000000000000000000000000000000000000000") {
    return;
  }
  const snapshotKey = `${accountId}-${timestamp}`;

  // Get account from store
  let account = await context.Accounts.get(accountId);

  if (!account) {
    account = {
      id: accountId,
      lastSnapshotTimestamp: 0n,
      lastProcessedBlock: 0n,
    };
    // Add to registry
    await addAccountToRegistry(context, accountId);
  }

  // Get existing snapshot or create new one
  let snapshot = await context.Snapshot.get(snapshotKey);

  if (!snapshot) {
    snapshot = {
      id: snapshotKey,
      account_id: accountId,
      timestamp: timestamp,
      balance: balance,
      point: BigDecimal(0),
      mintAmount: BigDecimal(0),
    } as Snapshot;
  } else {
    // Update the balance
    snapshot = {
      ...snapshot,
      balance: balance,
    } as Snapshot;
  }

  // Handle mint amount if it's a mint transaction
  if (isMint) {
    // If we already have a mintAmount, add to it
    const currentMintAmount = snapshot?.mintAmount || BigDecimal(0);
    snapshot = {
      ...snapshot,
      mintAmount: currentMintAmount.plus(BigDecimal(mintAmount.toString())),
    } as Snapshot;
  } else if (!snapshot?.mintAmount) {
    // Only set mintAmount if not already set
    snapshot = {
      ...snapshot,
      mintAmount: lastMintAmount,
    } as Snapshot;
  }

  // Calculate point based on previous values
  if (lastTimestamp != 0n) {
    const calcStartTime = performance.now();
    // Convert timestamps to seconds for calculation
    const timeDiffInSeconds = Number(timestamp - lastTimestamp);

    // Calculate points per second (1000 points per day)
    const pointsPerSecond = BigDecimal(POINTS_PER_DAY)
      .div(BigDecimal(24))
      .div(BigDecimal(60))
      .div(BigDecimal(60));

    const point = lastPoint.plus(
      lastBalance.times(pointsPerSecond).times(BigDecimal(timeDiffInSeconds))
    );

    // Calculate new point value
    // Points = lastPoint + (lastBalance * pointsPerSecond * timeDiffInSeconds)
    snapshot = {
      ...snapshot,
      point: point,
    } as Snapshot;
  } else {
    // For first snapshot, start with 0 points
    snapshot = {
      ...snapshot,
      point: BigDecimal(0),
    } as Snapshot;
  }

  // Update account's last snapshot timestamp
  account = {
    ...account,
    lastSnapshotTimestamp: timestamp,
  };

  // Save directly to database
  if (snapshot) {
    context.Snapshot.set(snapshot);
  }
  context.Accounts.set(account);
}
