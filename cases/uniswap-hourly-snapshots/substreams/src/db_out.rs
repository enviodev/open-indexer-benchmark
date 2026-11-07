use crate::pb::evm::swaps::v1::Swaps;
use substreams::pb::substreams::store_delta::Operation;
use substreams::skip_empty_output;
use substreams::store::{DeltaString, Deltas};
use substreams_database_change::{pb::database::DatabaseChanges, tables::Tables};

#[substreams::handlers::map]
fn db_out(
    swaps: Swaps,
    snapshots: Deltas<DeltaString>,
) -> Result<DatabaseChanges, substreams::errors::Error> {
    skip_empty_output();

    let mut tables = Tables::new();

    for swap in swaps.swaps {
        tables
            .create_row("swap", swap.id)
            .set("amount0", swap.amount0)
            .set("amount1", swap.amount1)
            .set("timestamp", swap.timestamp);
    }

    // The sink has no upsert, so the hour's row follows its store delta: the
    // first block of an hour creates the key, and the sink turns that into an
    // INSERT; every later block of the hour updates it, which becomes an
    // UPDATE.
    for delta in snapshots.deltas.iter() {
        let mut parts = delta.new_value.splitn(3, ':');
        let (Some(block_number), Some(sqrt_price_x96), Some(tick)) =
            (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        let row = match delta.operation {
            Operation::Create => tables.create_row("hourly_snapshot", delta.key.clone()),
            Operation::Update => tables.update_row("hourly_snapshot", delta.key.clone()),
            _ => continue,
        };
        row.set_raw("block_number", block_number.to_string())
            .set_raw("sqrt_price_x96", sqrt_price_x96.to_string())
            .set_raw("tick", tick.to_string());
    }

    Ok(tables.to_database_changes())
}
