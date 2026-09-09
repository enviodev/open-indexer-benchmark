use crate::pb::evm::transfers::v1::TransferEvents;
use substreams::skip_empty_output;
use substreams_database_change::{pb::database::DatabaseChanges, tables::Tables};

#[substreams::handlers::map]
fn db_out(events: TransferEvents) -> Result<DatabaseChanges, substreams::errors::Error> {
    skip_empty_output();

    let mut tables = Tables::new();
    for event in events.data {
        tables
            .create_row("transfer_event", event.id)
            .set("amount", event.amount)
            .set("from_address", event.from_address)
            .set("to_address", event.to_address)
            .set("block_timestamp", event.block_timestamp);
    }

    Ok(tables.to_database_changes())
}
