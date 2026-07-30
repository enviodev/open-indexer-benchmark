// Handlers for the account-balances case.
//
// `rindexer codegen indexer` generates the event-table inserts below; the
// aggregation on top of them is this benchmark's own. A no-code project would
// express the same thing as declarative `tables:` operations, but the rust
// project type gives the handler the database directly, so a balance update is
// one upsert with the arithmetic in SQL.
use alloy::primitives::{Address, I256, U256};
use rindexer::{
    event::callback_registry::EventCallbackRegistry, rindexer_error, rindexer_info,
    EthereumSqlTypeWrapper, PostgresClient,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::OnceCell;

use super::super::super::typings::erc_20indexer::events::rocket_token_reth::{
    no_extensions, ApprovalEvent, RocketTokenRETHEventType, TransferEvent,
};

/// rindexer derives this from the project and contract names, and owns the
/// event tables inside it. The aggregate tables are created alongside them.
const SCHEMA: &str = "erc_20indexer_rocket_token_reth";

/// `drop_each_run` wipes the schema before indexing starts, so the aggregate
/// tables are created on the first batch rather than at startup.
static AGGREGATE_TABLES: OnceCell<()> = OnceCell::const_new();

async fn ensure_aggregate_tables(database: &Arc<PostgresClient>) -> Result<(), String> {
    let mut outcome: Result<(), String> = Ok(());
    AGGREGATE_TABLES
        .get_or_init(|| async {
            let statements = [
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.account (
                         id TEXT PRIMARY KEY,
                         balance NUMERIC NOT NULL DEFAULT 0
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.allowance (
                         owner TEXT NOT NULL,
                         spender TEXT NOT NULL,
                         amount NUMERIC NOT NULL DEFAULT 0,
                         PRIMARY KEY (owner, spender)
                     )"
                ),
            ];
            for statement in statements {
                if let Err(e) = database.execute(&statement, &[]).await {
                    outcome = Err(format!("creating aggregate tables: {e:?}"));
                    return;
                }
            }
        })
        .await;
    outcome
}

/// Lowercase hex, matching how every other implementation in this case stores
/// an address.
fn hex(address: &Address) -> String {
    format!("0x{address:x}")
}

async fn approval_handler(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    let handler = ApprovalEvent::handler(
        |results, context| async move {
            if results.is_empty() {
                return Ok(());
            }
            ensure_aggregate_tables(&context.database).await?;

            let mut postgres_bulk_data: Vec<Vec<EthereumSqlTypeWrapper>> = vec![];
            // An allowance is overwritten by the latest Approval for its
            // (owner, spender) pair. Collapsing the batch first keeps the
            // upsert to one row per pair — Postgres rejects an ON CONFLICT
            // statement that touches the same row twice.
            let mut latest: HashMap<(Address, Address), U256> = HashMap::new();

            for result in results.iter() {
                postgres_bulk_data.push(vec![
                    EthereumSqlTypeWrapper::Address(result.tx_information.address),
                    EthereumSqlTypeWrapper::Address(result.event_data.owner),
                    EthereumSqlTypeWrapper::Address(result.event_data.spender),
                    EthereumSqlTypeWrapper::U256(result.event_data.value),
                    EthereumSqlTypeWrapper::B256(result.tx_information.transaction_hash),
                    EthereumSqlTypeWrapper::U64(result.tx_information.block_number),
                    EthereumSqlTypeWrapper::DateTimeNullable(
                        result.tx_information.block_timestamp_to_datetime(),
                    ),
                    EthereumSqlTypeWrapper::B256(result.tx_information.block_hash),
                    EthereumSqlTypeWrapper::String(result.tx_information.network.to_string()),
                    EthereumSqlTypeWrapper::U64(result.tx_information.transaction_index),
                    EthereumSqlTypeWrapper::U256(result.tx_information.log_index),
                ]);
                latest.insert(
                    (result.event_data.owner, result.event_data.spender),
                    result.event_data.value,
                );
            }

            let rows = [
                "contract_address".to_string(),
                "owner".to_string(),
                "spender".to_string(),
                "value".to_string(),
                "tx_hash".to_string(),
                "block_number".to_string(),
                "block_timestamp".to_string(),
                "block_hash".to_string(),
                "network".to_string(),
                "tx_index".to_string(),
                "log_index".to_string(),
            ];

            if let Err(e) = context
                .database
                .insert_bulk(&format!("{SCHEMA}.approval"), &rows, &postgres_bulk_data)
                .await
            {
                rindexer_error!(
                    "RocketTokenRETHEventType::Approval inserting bulk data: {:?}",
                    e
                );
                return Err(e.to_string());
            }

            let values = latest
                .iter()
                .map(|((owner, spender), amount)| {
                    format!("('{}','{}',{})", hex(owner), hex(spender), amount)
                })
                .collect::<Vec<_>>()
                .join(",");
            if let Err(e) = context
                .database
                .execute(
                    &format!(
                        "INSERT INTO {SCHEMA}.allowance AS a (owner, spender, amount)
                         VALUES {values}
                         ON CONFLICT (owner, spender) DO UPDATE SET amount = EXCLUDED.amount"
                    ),
                    &[],
                )
                .await
            {
                rindexer_error!("RocketTokenRETHEventType::Approval allowances: {:?}", e);
                return Err(e.to_string());
            }

            rindexer_info!(
                "RocketTokenRETH::Approval - INDEXED - {} events",
                results.len(),
            );

            Ok(())
        },
        no_extensions(),
    )
    .await;

    RocketTokenRETHEventType::Approval(handler)
        .register(manifest_path, registry)
        .await;
}

async fn transfer_handler(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    let handler = TransferEvent::handler(
        |results, context| async move {
            if results.is_empty() {
                return Ok(());
            }
            ensure_aggregate_tables(&context.database).await?;

            let mut postgres_bulk_data: Vec<Vec<EthereumSqlTypeWrapper>> = vec![];
            // Balances accumulate signed deltas, so a self-transfer nets to
            // zero and an address seen only as a sender ends up negative —
            // both of which the ground truth checks. Summing the batch in
            // memory first also collapses the upsert to one row per address.
            let mut deltas: HashMap<Address, I256> = HashMap::new();

            for result in results.iter() {
                postgres_bulk_data.push(vec![
                    EthereumSqlTypeWrapper::Address(result.tx_information.address),
                    EthereumSqlTypeWrapper::Address(result.event_data.from),
                    EthereumSqlTypeWrapper::Address(result.event_data.to),
                    EthereumSqlTypeWrapper::U256(result.event_data.value),
                    EthereumSqlTypeWrapper::B256(result.tx_information.transaction_hash),
                    EthereumSqlTypeWrapper::U64(result.tx_information.block_number),
                    EthereumSqlTypeWrapper::DateTimeNullable(
                        result.tx_information.block_timestamp_to_datetime(),
                    ),
                    EthereumSqlTypeWrapper::B256(result.tx_information.block_hash),
                    EthereumSqlTypeWrapper::String(result.tx_information.network.to_string()),
                    EthereumSqlTypeWrapper::U64(result.tx_information.transaction_index),
                    EthereumSqlTypeWrapper::U256(result.tx_information.log_index),
                ]);

                // Transfer values are bounded by total supply, far below the
                // point where the raw reinterpretation could go negative.
                let value = I256::from_raw(result.event_data.value);
                *deltas.entry(result.event_data.from).or_insert(I256::ZERO) -= value;
                *deltas.entry(result.event_data.to).or_insert(I256::ZERO) += value;
            }

            let rows = [
                "contract_address".to_string(),
                "from".to_string(),
                "to".to_string(),
                "value".to_string(),
                "tx_hash".to_string(),
                "block_number".to_string(),
                "block_timestamp".to_string(),
                "block_hash".to_string(),
                "network".to_string(),
                "tx_index".to_string(),
                "log_index".to_string(),
            ];

            if let Err(e) = context
                .database
                .insert_bulk(&format!("{SCHEMA}.transfer"), &rows, &postgres_bulk_data)
                .await
            {
                rindexer_error!(
                    "RocketTokenRETHEventType::Transfer inserting bulk data: {:?}",
                    e
                );
                return Err(e.to_string());
            }

            let values = deltas
                .iter()
                .map(|(address, delta)| format!("('{}',{})", hex(address), delta))
                .collect::<Vec<_>>()
                .join(",");
            if let Err(e) = context
                .database
                .execute(
                    &format!(
                        "INSERT INTO {SCHEMA}.account AS a (id, balance)
                         VALUES {values}
                         ON CONFLICT (id) DO UPDATE SET balance = a.balance + EXCLUDED.balance"
                    ),
                    &[],
                )
                .await
            {
                rindexer_error!("RocketTokenRETHEventType::Transfer balances: {:?}", e);
                return Err(e.to_string());
            }

            rindexer_info!(
                "RocketTokenRETH::Transfer - INDEXED - {} events",
                results.len(),
            );

            Ok(())
        },
        no_extensions(),
    )
    .await;

    RocketTokenRETHEventType::Transfer(handler)
        .register(manifest_path, registry)
        .await;
}

pub async fn rocket_token_reth_handlers(
    manifest_path: &PathBuf,
    registry: &mut EventCallbackRegistry,
) {
    approval_handler(manifest_path, registry).await;
    transfer_handler(manifest_path, registry).await;
}
