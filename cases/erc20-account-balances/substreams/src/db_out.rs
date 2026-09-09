use crate::pb::evm::balances::v1::Events;
use substreams::pb::substreams::store_delta::Operation;
use substreams::store::{Deltas, DeltaBigInt};
use substreams::skip_empty_output;
use substreams_database_change::{pb::database::DatabaseChanges, tables::Tables};

#[substreams::handlers::map]
fn db_out(
    events: Events,
    balances: Deltas<DeltaBigInt>,
    allowances: Deltas<DeltaBigInt>,
) -> Result<DatabaseChanges, substreams::errors::Error> {
    skip_empty_output();

    let mut tables = Tables::new();

    for transfer in events.transfers {
        tables
            .create_row("transfer_event", transfer.id)
            .set("amount", transfer.amount)
            .set("from_address", transfer.from_address)
            .set("to_address", transfer.to_address)
            .set("block_timestamp", transfer.block_timestamp);
    }

    for approval in events.approvals {
        tables
            .create_row("approval_event", approval.id)
            .set("amount", approval.amount)
            .set("owner_address", approval.owner_address)
            .set("spender_address", approval.spender_address)
            .set("block_timestamp", approval.block_timestamp);
    }

    // A store delta carries the value the key now holds, so the aggregate rows
    // are written as upserts of that value rather than read back and adjusted.
    for delta in balances.deltas.iter() {
        if delta.operation == Operation::Delete {
            continue;
        }
        tables
            .update_row("account", delta.key.clone())
            .set("balance", delta.new_value.to_string());
    }

    for delta in allowances.deltas.iter() {
        if delta.operation == Operation::Delete {
            continue;
        }
        let (owner, spender) = delta.key.split_once(':').unwrap_or((&delta.key, ""));
        tables
            .update_row("allowance", delta.key.clone())
            .set("owner_address", owner)
            .set("spender_address", spender)
            .set("amount", delta.new_value.to_string());
    }

    Ok(tables.to_database_changes())
}
