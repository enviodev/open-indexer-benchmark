use crate::pb::evm::safes::v1::{Events, Proxies};
use substreams::skip_empty_output;
use substreams_database_change::{pb::database::DatabaseChanges, tables::Tables};

#[substreams::handlers::map]
fn db_out(
    proxies: Proxies,
    events: Events,
) -> Result<DatabaseChanges, substreams::errors::Error> {
    skip_empty_output();

    let mut tables = Tables::new();

    for safe in proxies.data {
        tables
            .create_row("safe", safe.id)
            .set("proxy", safe.proxy)
            .set("singleton", safe.singleton)
            .set("block_timestamp", safe.block_timestamp);
    }

    for setup in events.setups {
        tables
            .create_row("safe_setup", setup.id)
            .set("safe", setup.safe)
            .set("initiator", setup.initiator)
            .set("threshold", setup.threshold)
            .set("block_timestamp", setup.block_timestamp);
    }

    for received in events.received {
        tables
            .create_row("safe_received", received.id)
            .set("safe", received.safe)
            .set("sender", received.sender)
            .set("value", received.value)
            .set("block_timestamp", received.block_timestamp);
    }

    for tx in events.module_transactions {
        tables
            .create_row("safe_module_transaction", tx.id)
            .set("safe", tx.safe)
            .set("module", tx.module)
            .set("to_address", tx.to)
            .set("value", tx.value)
            .set("operation", tx.operation)
            .set("block_timestamp", tx.block_timestamp);
    }

    for tx in events.multisig_transactions {
        tables
            .create_row("safe_multi_sig_transaction", tx.id)
            .set("safe", tx.safe)
            .set("to_address", tx.to)
            .set("value", tx.value)
            .set("operation", tx.operation)
            .set("block_timestamp", tx.block_timestamp);
    }

    for execution in events.executions {
        tables
            .create_row(&execution.table, execution.id)
            .set("safe", execution.safe)
            .set("payment", execution.payment)
            .set("block_timestamp", execution.block_timestamp);
    }

    for threshold in events.thresholds {
        tables
            .create_row("changed_threshold", threshold.id)
            .set("safe", threshold.safe)
            .set("threshold", threshold.threshold)
            .set("block_timestamp", threshold.block_timestamp);
    }

    for event in events.address_events {
        tables
            .create_row(&event.table, event.id)
            .set("safe", event.safe)
            .set(&event.column, event.address)
            .set("block_timestamp", event.block_timestamp);
    }

    Ok(tables.to_database_changes())
}
