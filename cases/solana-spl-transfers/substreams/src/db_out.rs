use crate::pb::spl::transfers::v1::Transfers;
use substreams::skip_empty_output;
use substreams_database_change::{pb::database::DatabaseChanges, tables::Tables};

#[substreams::handlers::map]
fn db_out(transfers: Transfers) -> Result<DatabaseChanges, substreams::errors::Error> {
    skip_empty_output();

    let mut tables = Tables::new();
    for transfer in transfers.data {
        tables
            .create_row("transfer", transfer.id)
            .set("amount", transfer.amount)
            .set("source", transfer.source)
            .set("destination", transfer.destination)
            .set("signer", transfer.signer)
            .set("tx_signature", transfer.tx_signature)
            .set("checked", transfer.checked)
            .set("slot", transfer.slot)
            .set("timestamp", transfer.timestamp);
    }

    Ok(tables.to_database_changes())
}
