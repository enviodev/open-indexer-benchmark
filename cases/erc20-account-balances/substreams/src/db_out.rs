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

    // A store delta says both what the key now holds and whether this is the
    // first time it held anything. The sink turns a create into an INSERT and
    // an update into an UPDATE, so an aggregate has to follow the delta: every
    // row created would collide on the second change, and every row updated
    // would never be inserted at all.
    for delta in balances.deltas.iter() {
        let value = delta.new_value.to_string();
        match delta.operation {
            Operation::Create => {
                tables.create_row("account", delta.key.clone()).set("balance", value);
            }
            Operation::Update => {
                tables.update_row("account", delta.key.clone()).set("balance", value);
            }
            _ => continue,
        }
    }

    for delta in allowances.deltas.iter() {
        let (owner, spender) = delta.key.split_once(':').unwrap_or((&delta.key, ""));
        let value = delta.new_value.to_string();
        match delta.operation {
            Operation::Create => {
                tables
                    .create_row("allowance", delta.key.clone())
                    .set("owner_address", owner)
                    .set("spender_address", spender)
                    .set("amount", value);
            }
            Operation::Update => {
                tables
                    .update_row("allowance", delta.key.clone())
                    .set("owner_address", owner)
                    .set("spender_address", spender)
                    .set("amount", value);
            }
            _ => continue,
        }
    }

    Ok(tables.to_database_changes())
}
