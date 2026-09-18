use crate::pb::evm::safes::v1::Proxies;
use substreams::store::{StoreNew, StoreSet, StoreSetInt64};

/// The proxies these factories have announced.
///
/// Written by a module that runs before the one that reads it on the same
/// block, which is what lets a proxy's own SafeSetup be attributed even though
/// it is emitted one log index below the ProxyCreation announcing it.
#[substreams::handlers::store]
fn store_proxies(proxies: Proxies, store: StoreSetInt64) {
    for safe in proxies.data {
        store.set(0, &safe.proxy, &1);
    }
}
