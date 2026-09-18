use crate::pb::evm::balances::v1::Events;
use std::str::FromStr;
use substreams::scalar::BigInt;
use substreams::store::{StoreAdd, StoreAddBigInt, StoreNew, StoreSet, StoreSetBigInt};

/// Running balance per address.
///
/// The case counts every address a transfer names, the zero address included,
/// which is what the other implementations do: a mint credits `to` and debits
/// the zero address, and both rows are published.
#[substreams::handlers::store]
fn store_balances(events: Events, store: StoreAddBigInt) {
    for transfer in events.transfers {
        let amount = BigInt::from_str(&transfer.amount).unwrap_or_else(|_| BigInt::zero());
        store.add(0, &transfer.from_address, amount.neg());
        store.add(0, &transfer.to_address, amount);
    }
}

/// The allowance a pair last agreed, which is what `Approval` reports — the
/// event carries the new figure rather than a delta, so the last one in the
/// range wins.
#[substreams::handlers::store]
fn store_allowances(events: Events, store: StoreSetBigInt) {
    for approval in events.approvals {
        let amount = BigInt::from_str(&approval.amount).unwrap_or_else(|_| BigInt::zero());
        store.set(
            0,
            format!("{}:{}", approval.owner_address, approval.spender_address),
            &amount,
        );
    }
}
