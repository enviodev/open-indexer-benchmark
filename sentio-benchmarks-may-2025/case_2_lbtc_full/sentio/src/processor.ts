// Write a processor and create dashboards to track various info for LBTC:
// • Emit transfer event logs for transfer events, require: sender, recipient and amount. (composing basic processors, use event logs)
// • Emit mint event logs, require: minter and amount. (use event filters)
// • Track all coin holders and their holding balances in a table. (write subgraph schema, use entities, create dashboards)
// • Be able to choose an account, and visualize his historical balance in a line chart.
// • Assuming users gain 1000 points for holding 1 LBTC/day, track their points in a table. Points need to be updated hourly.


// Sentio processor for coinbase's staking token LBTC
import { LBTCContext, LBTCProcessor, TransferEvent } from './types/eth/lbtc.js'
import { getPriceByType, token } from "@sentio/sdk/utils"
import { BigDecimal, Counter, Gauge } from "@sentio/sdk"
import { EthChainId, isNullAddress } from "@sentio/sdk/eth";
import { LBTC_PROXY, MULTICALL_ADDRESS } from "./constant.js"
import { AccountSnapshot, Transfer } from './schema/schema.js'
import { GLOBAL_CONFIG } from "@sentio/runtime";
import { Multicall } from "./multicall.js"

GLOBAL_CONFIG.execution = {
  sequential: true,
};

const SECOND_PER_DAY = 60 * 60 * 24;
const DAILY_POINTS = 1000;

// commonly used option for Gauge
// set sparse to true
// and aggregation interval to 60 min
export const volOptions = {
    sparse: true,
    aggregationConfig: {
        intervalInMinutes: [60],
    }
}

// Add timer variables
let rpcBalanceTime = 0;
let pointCalcTime = 0;
let storageTime = 0;
let operationCount = 0;

// Helper function to get timestamp
function getTimestamp(ctx: LBTCContext): bigint {
    // For transfer events, block timestamp is undefined, so use context timestamp
    if (ctx.block?.timestamp === undefined) {
        return BigInt(Math.floor(ctx.timestamp.getTime() / 1000));
    }
    return BigInt(ctx.block.timestamp);
}

// Helper function to get last snapshot data
async function getLastSnapshotData(ctx: LBTCContext, account: string): Promise<{
    timestamp: bigint;
    lbtcBalance: BigDecimal;
    points: BigDecimal;
}> {
    const storageStartTime = performance.now();
    const snapshot = await ctx.store.get(AccountSnapshot, account);
    storageTime += performance.now() - storageStartTime;

    if (snapshot) {
        return {
            timestamp: snapshot.timestamp,
            lbtcBalance: snapshot.lbtcBalance,
            points: snapshot.points
        };
    }

    return {
        timestamp: 0n,
        lbtcBalance: new BigDecimal(0),
        points: new BigDecimal(0)
    };
}

// event handler for Transfer event
const transferEventHandler = async function (event: TransferEvent, ctx: LBTCContext) {
    const tokenInfo = await token.getERC20TokenInfo(ctx, ctx.contract.address)
    const symbol = tokenInfo.symbol
    const { from, to, value } = event.args
    const amount = value.scaleDown(tokenInfo.decimal)

    const transfer = new Transfer({
        id: `${ctx.chainId}_${event.blockNumber}_${event.index}`,
        from: event.args.from,
        to: event.args.to,
        value: event.args.value,
        blockNumber: BigInt(event.blockNumber),
    });

    // Measure storage time for transfer upsert
    const storageStartTime = performance.now();
    await ctx.store.upsert(transfer);
    storageTime += performance.now() - storageStartTime;

    // Get balances for both accounts using multicall
    const rpcStartTime = performance.now();
    const multicall = new Multicall(ctx, MULTICALL_ADDRESS);
    const balances = await multicall.aggregate(
        async (account) => {
            const result = await ctx.contract.balanceOf(account)
            return result
        },
        [from, to].filter(account => !isNullAddress(account)),
        50 // batch size to avoid RPC timeouts
    );
    rpcBalanceTime += performance.now() - rpcStartTime;

    // Create a map of account balances
    const balanceMap = new Map<string, BigDecimal>();
    let balanceIndex = 0;
    for (const account of [from, to]) {
        if (!isNullAddress(account)) {
            balanceMap.set(account, BigDecimal(balances[balanceIndex].toString()).div(BigDecimal(10).pow(tokenInfo.decimal)));
            balanceIndex++;
        }
    }

    const newSnapshots = await Promise.all(
        [from, to]
            .filter((account) => !isNullAddress(account))
            .map(async (account) => {
                const lastData = await getLastSnapshotData(ctx, account);
                return process(ctx, account, lastData, event.name, balanceMap.get(account));
            })
    );

    // Measure storage time for snapshots upsert
    const snapshotStorageStartTime = performance.now();
    await ctx.store.upsert(newSnapshots);
    storageTime += performance.now() - snapshotStorageStartTime;
}

async function updateAll(ctx: LBTCContext, triggerEvent: string) {
    // Get all snapshots
    const storageStartTime = performance.now();
    const snapshots = await ctx.store.list(AccountSnapshot, []);
    storageTime += performance.now() - storageStartTime;
    
    if (!snapshots || snapshots.length === 0) {
        return;
    }
    
    const accounts = snapshots.map(s => s.id);
    
    // For interval updates, we don't need to query balances since they haven't changed
    const newSnapshots = await Promise.all(
        accounts.map(async (account: string) => {
            const lastData = await getLastSnapshotData(ctx, account);
            // Pass undefined for newBalance to use the stored balance
            return process(ctx, account, lastData, triggerEvent);
        })
    );

    // Measure storage time for bulk snapshot updates
    const snapshotStorageStartTime = performance.now();
    await ctx.store.upsert(newSnapshots);
    storageTime += performance.now() - snapshotStorageStartTime;
}

// process function to update the balance and points of each account
async function process(
    ctx: LBTCContext,
    account: string,
    lastData: {
        timestamp: bigint;
        lbtcBalance: BigDecimal;
        points: BigDecimal;
    },
    triggerEvent: string,
    newBalance?: BigDecimal
) {
    const snapshotTimestamp = lastData.timestamp;
    const snapshotLbtcBalance = lastData.lbtcBalance;
    
    // Get current timestamp
    const newTimestamp = getTimestamp(ctx);
    
    // Measure point calculation time
    const pointStartTime = performance.now();
    const points = lastData.points.plus(calcPoints(ctx, snapshotTimestamp, snapshotLbtcBalance));
    pointCalcTime += performance.now() - pointStartTime;

    // For interval updates (when newBalance is undefined), use the existing balance
    const newLbtcBalance = newBalance || snapshotLbtcBalance;
    
    const newSnapshot = new AccountSnapshot({
        id: account,
        timestamp: newTimestamp,
        lbtcBalance: newLbtcBalance,
        points: points,
    });

    // Measure storage operation time for event emission
    const storageStartTime = performance.now();
    ctx.eventLogger.emit("point_update", {
        account,
        points,
        snapshotTimestamp,
        snapshotLbtcBalance,
        newTimestamp,
        newLbtcBalance,
        triggerEvent,
    });
    storageTime += performance.now() - storageStartTime;

    operationCount++;
    if (operationCount % 1000 === 0 || ctx.blockNumber >= 22500000) {
        console.log(
            `[TRACE] Block ${ctx.blockNumber} (${newTimestamp}) - Performance metrics after ${operationCount} operations:\n` +
            `RPC balanceOf: ${(rpcBalanceTime / 1000).toFixed(2)}s, ` +
            `Point calc: ${(pointCalcTime / 1000).toFixed(2)}s, ` +
            `Storage: ${(storageTime / 1000).toFixed(2)}s`
        );
    }

    return newSnapshot;
}

// calculate the points for each account based on the balance and time
function calcPoints(
    ctx: LBTCContext,
    snapshotTimestamp: bigint,
    snapshotLbtcBalance: BigDecimal
): BigDecimal {
    const now = Number(getTimestamp(ctx));
    const snapshot = Number(snapshotTimestamp);
    
    const deltaDay = (now - snapshot) / SECOND_PER_DAY;
    const lPoints = snapshotLbtcBalance
      .multipliedBy(deltaDay)
      .multipliedBy(DAILY_POINTS);

    return lPoints;
}

// Update processor binding
LBTCProcessor.bind({ address: LBTC_PROXY, startBlock: 22400000, endBlock: 22500000 })
    .onEventTransfer(transferEventHandler) // if filter by mint LBTC Processor.filters.Transfer(0x0, null)
    // .onTimeInterval(
    //     async (_, ctx) => {
    //         await updateAll(ctx, "TimeInterval");
    //     },
    //     60,
    //     60 * 24
    // )
    .onBlockInterval(
        async (_: unknown, ctx: LBTCContext) => {
            await updateAll(ctx, "BlockInterval");
        },
        60*24/12,
        60*60*24/12
    )
