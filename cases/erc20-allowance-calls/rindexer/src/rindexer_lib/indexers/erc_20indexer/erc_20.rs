// Handler for the allowance-call case.
//
// `rindexer codegen indexer` generates a handler that inserts each Approval
// into the event table rindexer derives from the ABI. That table has columns
// for the event's own arguments and nothing else, and this case's row also
// carries the allowance the token reports afterwards — which is not in the log.
// So the two tables the case verifies are created and written here, and
// codegen's insert into `erc_20indexer_erc_20.approval` is dropped rather than
// kept alongside them: leaving it in would make rindexer the only
// implementation writing every event twice.
//
// The calls go through the provider rindexer already maintains, using its own
// `eth_call` helper: the crate is built against a different major version of
// alloy than this project, so the provider it hands the handler does not
// implement the `Provider` trait as this crate sees it, and its helper takes
// the block to read at anyway. What matters is that the calls are issued for
// the whole batch at once — a rust project gets the batch, so the 300ms round
// trips overlap instead of adding up.
use alloy::{
    primitives::{Address, U256},
    sol,
    sol_types::SolCall,
};
use futures::future::join_all;
use rindexer::{
    event::callback_registry::EventCallbackRegistry, rindexer_error, EthereumSqlTypeWrapper,
    PostgresClient,
};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::OnceCell;

use super::super::super::typings::erc_20indexer::events::erc_20::{
    no_extensions, ApprovalEvent, ERC20EventType,
};
use super::super::super::typings::networks::get_ethereum_provider_cache;

sol! {
    interface IERC20 {
        function allowance(address owner, address spender) external view returns (uint256);
    }
}

/// The schema rindexer derives from the project and contract names, and owns
/// the generated event table inside. The case's tables are created alongside it.
const SCHEMA: &str = "erc_20indexer_erc_20";

/// `drop_each_run` wipes the schema before indexing starts, so the case's
/// tables are created on the first batch rather than at startup.
static CASE_TABLES: OnceCell<()> = OnceCell::const_new();

async fn ensure_case_tables(database: &Arc<PostgresClient>) -> Result<(), String> {
    let mut outcome: Result<(), String> = Ok(());
    CASE_TABLES
        .get_or_init(|| async {
            let statements = [
                // Column types match the ones rindexer picks for the same
                // values in the tables it generates: an address is CHAR(42), a
                // uint256 its decimal string, a block number NUMERIC. They have
                // to — the bulk insert writes binary, so a column whose type
                // differs from the wrapper's is rejected outright.
                // `block_number` is what the benchmark reads progress from.
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.approval_event (
                         token CHAR(42) NOT NULL,
                         owner CHAR(42) NOT NULL,
                         spender CHAR(42) NOT NULL,
                         approved VARCHAR(78) NOT NULL,
                         allowance VARCHAR(78) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.token_allowance (
                         token CHAR(42) NOT NULL,
                         owner CHAR(42) NOT NULL,
                         spender CHAR(42) NOT NULL,
                         allowance VARCHAR(78) NOT NULL,
                         PRIMARY KEY (token, owner, spender)
                     )"
                ),
            ];
            for statement in statements {
                if let Err(e) = database.execute(&statement, &[]).await {
                    outcome = Err(format!("creating the case's tables: {e:?}"));
                    return;
                }
            }
        })
        .await;
    outcome
}

/// Lowercase hex, matching how every other implementation stores an address.
fn hex(address: &Address) -> String {
    format!("0x{address:x}")
}

async fn approval_handler(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    let handler = ApprovalEvent::handler(
        |results, context| async move {
            if results.is_empty() {
                return Ok(());
            }
            ensure_case_tables(&context.database).await?;

            let provider = get_ethereum_provider_cache().await;

            // Every allowance read in the batch is issued at once. An approval
            // of zero revokes it — a revoked allowance is zero whatever the
            // token reports — so those need no call at all.
            let allowances: Vec<Result<U256, String>> = join_all(results.iter().map(|result| {
                let provider = provider.clone();
                let token = result.tx_information.address;
                let owner = result.event_data.owner;
                let spender = result.event_data.spender;
                let block = result.tx_information.block_number;
                let approved = result.event_data.value;
                async move {
                    if approved.is_zero() {
                        return Ok(U256::ZERO);
                    }
                    let input = IERC20::allowanceCall { owner, spender }.abi_encode();
                    // rindexer's own provider call, which takes the block to
                    // read at: the allowance is a value at a point in the
                    // chain's history, not at the head.
                    let returned = provider
                        .eth_call(token, input.into(), block)
                        .await
                        .map_err(|e| format!("allowance call failed: {e:?}"))?;
                    U256::from_str_radix(returned.trim_start_matches("0x"), 16)
                        .map_err(|e| format!("allowance call returned {returned}: {e:?}"))
                }
            }))
            .await;

            let mut postgres_bulk_data: Vec<Vec<EthereumSqlTypeWrapper>> = vec![];
            // An allowance is overwritten by the latest Approval for its
            // (token, owner, spender) triple. Collapsing the batch first keeps
            // the upsert to one row per triple — Postgres rejects an ON
            // CONFLICT statement that touches the same row twice.
            let mut latest: HashMap<(Address, Address, Address), U256> = HashMap::new();

            for (result, allowance) in results.iter().zip(allowances) {
                let allowance = allowance?;
                let token = result.tx_information.address;
                postgres_bulk_data.push(vec![
                    EthereumSqlTypeWrapper::Address(token),
                    EthereumSqlTypeWrapper::Address(result.event_data.owner),
                    EthereumSqlTypeWrapper::Address(result.event_data.spender),
                    EthereumSqlTypeWrapper::U256(result.event_data.value),
                    EthereumSqlTypeWrapper::U256(allowance),
                    EthereumSqlTypeWrapper::U64(result.tx_information.block_number),
                    EthereumSqlTypeWrapper::DateTimeNullable(
                        result.tx_information.block_timestamp_to_datetime(),
                    ),
                ]);
                latest.insert(
                    (token, result.event_data.owner, result.event_data.spender),
                    allowance,
                );
            }

            let rows = [
                "token".to_string(),
                "owner".to_string(),
                "spender".to_string(),
                "approved".to_string(),
                "allowance".to_string(),
                "block_number".to_string(),
                "block_timestamp".to_string(),
            ];

            if let Err(e) = context
                .database
                .insert_bulk(&format!("{SCHEMA}.approval_event"), &rows, &postgres_bulk_data)
                .await
            {
                rindexer_error!("ERC20EventType::Approval inserting bulk data: {:?}", e);
                return Err(e.to_string());
            }

            let values = latest
                .iter()
                .map(|((token, owner, spender), allowance)| {
                    format!(
                        "('{}','{}','{}','{}')",
                        hex(token),
                        hex(owner),
                        hex(spender),
                        allowance
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            if let Err(e) = context
                .database
                .execute(
                    &format!(
                        "INSERT INTO {SCHEMA}.token_allowance AS a (token, owner, spender, allowance)
                         VALUES {values}
                         ON CONFLICT (token, owner, spender)
                         DO UPDATE SET allowance = EXCLUDED.allowance"
                    ),
                    &[],
                )
                .await
            {
                rindexer_error!("ERC20EventType::Approval allowances: {:?}", e);
                return Err(e.to_string());
            }

            Ok(())
        },
        no_extensions(),
    )
    .await;

    ERC20EventType::Approval(handler)
        .register(manifest_path, registry)
        .await;
}

pub async fn erc_20_handlers(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    approval_handler(manifest_path, registry).await;
}
