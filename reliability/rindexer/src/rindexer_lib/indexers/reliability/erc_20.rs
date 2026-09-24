// Handlers for the reliability case.
//
// `rindexer codegen indexer` generates a handler per event that bulk-inserts
// it into the table rindexer derives from the ABI. Both are kept, with two
// changes that the no-code version of this project did not need to make by
// hand:
//
// - The Transfer handler also writes the running balance and the token row.
//   A rust project's handlers are registered without the yaml's `tables:`
//   section, so the balance a no-code project declares there is written here.
//   The token row comes from a `symbol()` and a `name()` read, and has to
//   survive the values the data fidelity checks serve through them: no
//   returndata at all, and a name carrying a NUL byte.
//
// - Each batch commits in one transaction, together with rindexer's own
//   last-synced cursor for the event. That is what no-code rindexer does with
//   its tables since v0.43.3, and what the codegen hint above its insert
//   points at: without it, a process killed between the insert and the
//   cursor re-reads the batch on restart and applies every balance change
//   twice. The same statements rindexer runs are written out here because
//   the helper that takes a caller's transaction is crate-private.
use alloy::{
    primitives::{Address, Bytes, U256},
    sol,
    sol_types::{SolCall, SolValue},
};
use rindexer::{
    event::callback_registry::EventCallbackRegistry, rindexer_error, rindexer_info,
    EthereumSqlTypeWrapper, PostgresClient, ToSql,
};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock};
use tokio::sync::{Mutex, OnceCell};

use super::super::super::typings::networks::get_ethereum_provider_cache;
use super::super::super::typings::reliability::events::erc_20::{
    no_extensions, ERC20EventType, MetadataUpdatedEvent, TransferEvent,
};

sol! {
    interface IERC20Metadata {
        function symbol() external view returns (string);
        function name() external view returns (string);
    }
}

/// The schema rindexer derives from the project and contract names. It owns
/// the generated event tables, and the case's own two are created beside them
/// so that `drop_each_run` clears all of them together.
const SCHEMA: &str = "reliability_erc_20";

/// The byte Postgres will not accept in a text column.
const NUL: char = '\0';

/// Rows per INSERT. Postgres takes at most 65,535 parameters in a statement,
/// and a transfer row has eleven.
const ROWS_PER_STATEMENT: usize = 5_000;

/// `drop_each_run` wipes the schema before indexing starts, so the case's
/// tables are created on the first batch rather than at startup.
static CASE_TABLES: OnceCell<()> = OnceCell::const_new();

/// Tokens whose row this process has already written or found, so the
/// metadata is read once per token rather than once per batch.
static KNOWN_TOKENS: LazyLock<Mutex<HashSet<Address>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// `get_or_try_init` rather than `get_or_init`: the latter stores its `()`
/// whatever happened inside, so a failed CREATE TABLE would be remembered as
/// done and every later batch would fail at the insert instead, reporting a
/// missing relation rather than why it is missing.
async fn ensure_case_tables(database: &Arc<PostgresClient>) -> Result<(), String> {
    CASE_TABLES
        .get_or_try_init(|| async {
            let statements = [
                // An address is CHAR(42), as rindexer stores one in the tables
                // it generates. The balance is NUMERIC rather than the
                // VARCHAR rindexer gives a uint256: it is summed in SQL, and
                // the address a mint comes from goes negative.
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.accounts (
                         address CHAR(42) PRIMARY KEY,
                         balance NUMERIC NOT NULL
                     )"
                ),
                // Both text columns nullable: a symbol() that answers nothing
                // is stored as a null, which is what the check asks for.
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.token (
                         address CHAR(42) PRIMARY KEY,
                         symbol TEXT,
                         name TEXT
                     )"
                ),
            ];
            for statement in statements {
                if let Err(e) = database.execute(&statement, &[]).await {
                    return Err(format!("creating the case's tables: {e:?}"));
                }
            }
            Ok(())
        })
        .await
        .map(|_| ())
}

/// Lowercase hex, matching how rindexer stores an address.
fn hex(address: &Address) -> String {
    format!("0x{address:x}")
}

/// A string as Postgres will store it: without NUL bytes, and empty as null.
///
/// An empty `StringNullable` is written as NULL, so both "answered nothing"
/// and "answered only NULs" end up as a null column rather than a text one.
fn storable(value: String) -> EthereumSqlTypeWrapper {
    EthereumSqlTypeWrapper::StringNullable(value.replace(NUL, ""))
}

/// Reads one of the token's string getters, treating "no answer" as a value.
///
/// Returndata that is empty (a token without the function) or does not decode
/// as a string comes back as an empty string, stored as a null. So does a
/// revert. Anything else - the node timing out, refusing, rate limiting - is
/// an error, which fails the batch: rindexer retries a failed handler, and a
/// row written from a node that was not answering would store a null for a
/// symbol the token does have.
async fn read_string(token: Address, input: Vec<u8>, block: u64) -> Result<String, String> {
    let provider = get_ethereum_provider_cache().await;
    let returned = match provider.eth_call(token, Bytes::from(input), block).await {
        Ok(returned) => returned,
        Err(e) => {
            let message = format!("{e:?}");
            if message.to_lowercase().contains("revert") {
                return Ok(String::new());
            }
            return Err(format!("reading token metadata from {}: {message}", hex(&token)));
        }
    };
    let bytes = alloy::hex::decode(returned.trim_start_matches("0x")).unwrap_or_default();
    Ok(String::abi_decode(&bytes).unwrap_or_default())
}

/// The token row statement for every token in the batch this process has not
/// seen yet, and the tokens it covers.
///
/// A token already in the table is not read again: the metadata is read once,
/// on the first transfer, as every other project in this suite does.
async fn new_token_rows(
    database: &Arc<PostgresClient>,
    seen: &[(Address, u64)],
) -> Result<(Vec<Statement>, Vec<Address>), String> {
    let mut statements = vec![];
    let mut tokens = vec![];
    for &(token, block) in seen {
        if KNOWN_TOKENS.lock().await.contains(&token) {
            continue;
        }
        let stored = database
            .query_one_or_none(
                &format!("SELECT 1 FROM {SCHEMA}.token WHERE address = $1"),
                &[&EthereumSqlTypeWrapper::Address(token)],
            )
            .await
            .map_err(|e| format!("looking up the token row: {e:?}"))?;
        if stored.is_none() {
            let symbol =
                read_string(token, IERC20Metadata::symbolCall {}.abi_encode(), block).await?;
            let name = read_string(token, IERC20Metadata::nameCall {}.abi_encode(), block).await?;
            statements.push(Statement {
                sql: format!(
                    "INSERT INTO {SCHEMA}.token (address, symbol, name) VALUES ($1, $2, $3)
                     ON CONFLICT (address) DO NOTHING"
                ),
                params: vec![
                    EthereumSqlTypeWrapper::Address(token),
                    storable(symbol),
                    storable(name),
                ],
            });
        }
        tokens.push(token);
    }
    Ok((statements, tokens))
}

/// The balance changes a batch of transfers makes, as one upsert.
///
/// Summed in SQL rather than here: an amount can be 2^256-1, and two of those
/// overflow any integer this handler has, where NUMERIC does not. The debit
/// and credit of a self-transfer cancel in the sum, which is what they
/// should do.
fn balance_upsert(changes: &[(Address, bool, U256)]) -> Statement {
    let values = changes
        .iter()
        .map(|(address, credit, amount)| {
            format!(
                "('{}', {}{}::numeric)",
                hex(address),
                if *credit { "" } else { "-" },
                amount
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    Statement {
        sql: format!(
            "INSERT INTO {SCHEMA}.accounts AS a (address, balance)
             SELECT address, SUM(delta) FROM (VALUES {values}) AS d(address, delta)
             GROUP BY address
             ON CONFLICT (address) DO UPDATE SET balance = a.balance + EXCLUDED.balance"
        ),
        params: vec![],
    }
}

/// A statement committed alongside a batch's event rows.
struct Statement {
    sql: String,
    params: Vec<EthereumSqlTypeWrapper>,
}

fn as_params(values: &[EthereumSqlTypeWrapper]) -> Vec<&(dyn ToSql + Sync)> {
    values.iter().map(|value| value as &(dyn ToSql + Sync)).collect()
}

/// Commits a batch: its event rows, whatever else it writes, and rindexer's
/// cursor for the event, all or nothing.
///
/// The cursor is moved to the batch's highest block, and only forward - the
/// statement rindexer's own atomic commit runs. The batch holds every log in
/// the range it was fetched for, so every log up to that block is in this
/// transaction; rindexer resumes from the block after it, and moves the
/// cursor on to the end of the range itself once the handler returns.
async fn commit_batch(
    database: &Arc<PostgresClient>,
    event: &str,
    columns: &[&str],
    rows: &[Vec<EthereumSqlTypeWrapper>],
    also: &[Statement],
    network: &str,
    to_block: u64,
) -> Result<(), String> {
    let table = format!("{SCHEMA}.{event}");
    let column_list = columns
        .iter()
        .map(|column| format!("\"{column}\""))
        .collect::<Vec<_>>()
        .join(", ");

    let mut connection = database.raw_connection().await.map_err(|e| format!("{e:?}"))?;
    let transaction = connection.transaction().await.map_err(|e| e.to_string())?;

    for chunk in rows.chunks(ROWS_PER_STATEMENT) {
        let placeholders = (0..chunk.len())
            .map(|row| {
                let first = row * columns.len();
                let row = (1..=columns.len())
                    .map(|i| format!("${}", first + i))
                    .collect::<Vec<_>>()
                    .join(", ");
                format!("({row})")
            })
            .collect::<Vec<_>>()
            .join(", ");
        let params: Vec<&(dyn ToSql + Sync)> = chunk
            .iter()
            .flatten()
            .map(|value| value as &(dyn ToSql + Sync))
            .collect();
        transaction
            .execute(
                &format!("INSERT INTO {table} ({column_list}) VALUES {placeholders}"),
                &params,
            )
            .await
            .map_err(|e| format!("inserting into {table}: {e}"))?;
    }

    for statement in also {
        transaction
            .execute(&statement.sql, &as_params(&statement.params))
            .await
            .map_err(|e| format!("{}: {e}", statement.sql))?;
    }

    let cursor_table = format!("rindexer_internal.{SCHEMA}_{event}");
    let network = network.to_string();
    let to_block = EthereumSqlTypeWrapper::U64(to_block);
    let moved = transaction
        .execute(
            &format!(
                "UPDATE {cursor_table} SET last_synced_block = $1
                 WHERE network = $2 AND $1 > last_synced_block"
            ),
            &[&to_block, &network],
        )
        .await
        .map_err(|e| format!("advancing {cursor_table}: {e}"))?;
    if moved == 0 {
        // Already at or past this block is fine: the live and historic loops
        // share the cursor. No row at all means it could never advance, and
        // committing would re-index from the start block on every restart.
        let row = transaction
            .query_opt(
                &format!("SELECT 1 FROM {cursor_table} WHERE network = $1"),
                &[&network],
            )
            .await
            .map_err(|e| format!("reading {cursor_table}: {e}"))?;
        if row.is_none() {
            return Err(format!("no cursor row for {network} in {cursor_table}"));
        }
    }

    transaction.commit().await.map_err(|e| e.to_string())
}

async fn transfer_handler(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    let handler = TransferEvent::handler(
        |results, context| async move {
            if results.is_empty() {
                return Ok(());
            }
            ensure_case_tables(&context.database).await?;

            let mut postgres_bulk_data: Vec<Vec<EthereumSqlTypeWrapper>> = vec![];
            let mut changes: Vec<(Address, bool, U256)> = vec![];
            let mut tokens: Vec<(Address, u64)> = vec![];

            for result in results.iter() {
                postgres_bulk_data.push(vec![
                    EthereumSqlTypeWrapper::Address(result.tx_information.address),
                    EthereumSqlTypeWrapper::Address(result.event_data.from),
                    EthereumSqlTypeWrapper::Address(result.event_data.to),
                    EthereumSqlTypeWrapper::U256(U256::from(result.event_data.value)),
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
                changes.push((result.event_data.from, false, result.event_data.value));
                changes.push((result.event_data.to, true, result.event_data.value));
                if !tokens.iter().any(|(token, _)| *token == result.tx_information.address) {
                    tokens.push((
                        result.tx_information.address,
                        result.tx_information.block_number,
                    ));
                }
            }

            // Read before the transaction opens, so a slow node holds up a
            // call rather than a connection with rows in it.
            let (mut also, new_tokens) = new_token_rows(&context.database, &tokens).await?;
            also.push(balance_upsert(&changes));

            let last = results.last().expect("the batch is not empty");
            let to_block = results
                .iter()
                .map(|result| result.tx_information.block_number)
                .max()
                .unwrap_or(last.tx_information.block_number);

            if let Err(e) = commit_batch(
                &context.database,
                "transfer",
                &[
                    "contract_address",
                    "from",
                    "to",
                    "value",
                    "tx_hash",
                    "block_number",
                    "block_timestamp",
                    "block_hash",
                    "network",
                    "tx_index",
                    "log_index",
                ],
                &postgres_bulk_data,
                &also,
                &last.tx_information.network,
                to_block,
            )
            .await
            {
                rindexer_error!("ERC20EventType::Transfer committing the batch: {}", e);
                return Err(e);
            }

            // Only once the row is committed: a batch that failed has to read
            // the metadata again when it is retried.
            KNOWN_TOKENS.lock().await.extend(new_tokens);

            rindexer_info!("ERC20::Transfer - INDEXED - {} events", results.len(),);

            Ok(())
        },
        no_extensions(),
    )
    .await;

    ERC20EventType::Transfer(handler)
        .register(manifest_path, registry)
        .await;
}

async fn metadata_updated_handler(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    let handler = MetadataUpdatedEvent::handler(
        |results, context| async move {
            if results.is_empty() {
                return Ok(());
            }

            let mut postgres_bulk_data: Vec<Vec<EthereumSqlTypeWrapper>> = vec![];

            for result in results.iter() {
                postgres_bulk_data.push(vec![
                    EthereumSqlTypeWrapper::Address(result.tx_information.address),
                    // The same cleaning as the token row: a string is legal in
                    // an event with a NUL in it, and Postgres refuses it.
                    EthereumSqlTypeWrapper::String(result.event_data.symbol.replace(NUL, "")),
                    EthereumSqlTypeWrapper::String(result.event_data.name.replace(NUL, "")),
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
            }

            let last = results.last().expect("the batch is not empty");
            let to_block = results
                .iter()
                .map(|result| result.tx_information.block_number)
                .max()
                .unwrap_or(last.tx_information.block_number);

            if let Err(e) = commit_batch(
                &context.database,
                "metadata_updated",
                &[
                    "contract_address",
                    "symbol",
                    "name",
                    "tx_hash",
                    "block_number",
                    "block_timestamp",
                    "block_hash",
                    "network",
                    "tx_index",
                    "log_index",
                ],
                &postgres_bulk_data,
                &[],
                &last.tx_information.network,
                to_block,
            )
            .await
            {
                rindexer_error!("ERC20EventType::MetadataUpdated committing the batch: {}", e);
                return Err(e);
            }

            rindexer_info!(
                "ERC20::MetadataUpdated - INDEXED - {} events",
                results.len(),
            );

            Ok(())
        },
        no_extensions(),
    )
    .await;

    ERC20EventType::MetadataUpdated(handler)
        .register(manifest_path, registry)
        .await;
}

pub async fn erc_20_handlers(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    transfer_handler(manifest_path, registry).await;

    metadata_updated_handler(manifest_path, registry).await;
}
