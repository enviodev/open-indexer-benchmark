use crate::pb::evm::swaps::v1::Swaps;
use substreams::pb::substreams::Clock;
use substreams::store::{StoreGet, StoreGetString, StoreNew, StoreSet, StoreSetString};

/// The key the pool's state is kept under. The case indexes a single pool.
pub const POOL_KEY: &str = "pool";

const HOUR: i64 = 3600;

/// The pool's state as of the latest swap, `<sqrtPriceX96>:<tick>`. Each swap
/// is set at its log's ordinal, so the block's last swap is what remains.
#[substreams::handlers::store]
fn store_pool(swaps: Swaps, store: StoreSetString) {
    for swap in swaps.swaps {
        store.set(
            swap.ordinal,
            POOL_KEY,
            &format!("{}:{}", swap.sqrt_price_x96, swap.tick),
        );
    }
}

/// The snapshot of every hour, keyed by the hour's start and holding
/// `<blockNumber>:<sqrtPriceX96>:<tick>`.
///
/// Runs on every block, not only the ones with a swap, because its input is
/// the clock. `get_last` reads the pool as it stands after this block's swaps;
/// `get_at(0, ..)` would read it before them. Rewriting the hour on every
/// block leaves it holding the pool as of the hour's last block.
#[substreams::handlers::store]
fn store_snapshots(clock: Clock, pool: StoreGetString, store: StoreSetString) {
    let Some(state) = pool.get_last(POOL_KEY) else {
        return;
    };
    let timestamp = clock.timestamp.map(|t| t.seconds).unwrap_or_default();
    let hour = timestamp - timestamp % HOUR;
    store.set(0, hour.to_string(), &format!("{}:{}", clock.number, state));
}
