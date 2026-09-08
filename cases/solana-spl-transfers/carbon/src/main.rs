//! Every USDC transfer made through the SPL Token program, written to Postgres.
//!
//! The datasource is Carbon's RPC block crawler, the only Carbon 2 source that
//! takes a bounded slot range: Geyser and `blockSubscribe` follow the head, and
//! the transaction crawler walks backwards from it by signature. It fetches
//! every block in the range whole, so unlike the other implementations here
//! nothing about the mint narrows what arrives.

use {
    carbon_core::{
        error::CarbonResult, instruction::InstructionProcessorInputType, pipeline::Pipeline,
        processor::Processor, transaction::TransactionMetadata,
    },
    carbon_log_metrics::LogMetrics,
    carbon_rpc_block_crawler_datasource::{RpcBlockConfig, RpcBlockCrawler},
    carbon_token_program_decoder::{
        instructions::TokenProgramInstruction, TokenProgramDecoder,
    },
    solana_commitment_config::CommitmentConfig,
    solana_transaction_status::UiTransactionEncoding,
    sqlx::{postgres::PgPoolOptions, PgPool, QueryBuilder},
    std::{env, sync::Arc, time::Duration},
    tokio::sync::mpsc,
};

/// USD Coin.
const MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/// Rows per insert. Carbon's own `PostgresInstructionProcessor` upserts one row
/// per instruction, which would make this a measurement of round trips rather
/// than of Carbon; a batch is what anyone writing this for real would do.
const BATCH_ROWS: usize = 500;

/// How long a partial batch waits before going out anyway, so the tail of a run
/// is never left sitting in memory.
const FLUSH_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Debug)]
struct Row {
    id: String,
    amount: u64,
    source: String,
    destination: String,
    signer: String,
    tx_signature: String,
    checked: bool,
    slot: i64,
    timestamp: i64,
}

fn env_var(name: &str) -> String {
    env::var(name).unwrap_or_else(|_| panic!("{name} must be set"))
}

fn env_slot(name: &str) -> u64 {
    env_var(name)
        .parse()
        .unwrap_or_else(|_| panic!("{name} must be a slot number"))
}

#[tokio::main]
async fn main() -> CarbonResult<()> {
    dotenv::dotenv().ok();
    env_logger::init();

    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&env_var("DATABASE_URL"))
        .await
        .expect("failed to connect to Postgres");

    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS transfer (
             id            TEXT PRIMARY KEY,
             amount        NUMERIC NOT NULL,
             source        TEXT    NOT NULL,
             destination   TEXT    NOT NULL,
             signer        TEXT    NOT NULL,
             tx_signature  TEXT    NOT NULL,
             checked       BOOLEAN NOT NULL,
             slot          BIGINT  NOT NULL,
             timestamp     BIGINT  NOT NULL
           )"#,
    )
    .execute(&pool)
    .await
    .expect("failed to create the transfer table");

    // The processor hands rows to a writer task rather than inserting inline:
    // a `Processor` has no end-of-stream hook, so the last partial batch would
    // otherwise never be written.
    let (sender, receiver) = mpsc::channel::<Row>(10_000);
    let writer = tokio::spawn(write_rows(pool, receiver));

    let start_slot = env_slot("START_SLOT");
    let end_slot = env_slot("END_SLOT");

    let datasource = RpcBlockCrawler::new(
        env_var("SOLANA_RPC_URL"),
        start_slot,
        Some(end_slot),
        None, // block interval: only used while waiting on the head
        RpcBlockConfig {
            encoding: Some(UiTransactionEncoding::Base64),
            max_supported_transaction_version: Some(0),
            rewards: Some(false),
            commitment: Some(CommitmentConfig::confirmed()),
            ..Default::default()
        },
        None, // max concurrent requests: Carbon's default
        None, // channel buffer: Carbon's default
    );

    Pipeline::builder()
        .datasource(datasource)
        .metrics(Arc::new(LogMetrics::new()))
        .instruction(TokenProgramDecoder, TransferProcessor { sender })
        .build()?
        .run()
        .await?;

    // Dropping the pipeline drops the processor and closes the channel, which
    // is what tells the writer to flush what is left and stop.
    writer.await.expect("row writer panicked");
    Ok(())
}

struct TransferProcessor {
    sender: mpsc::Sender<Row>,
}

impl Processor<InstructionProcessorInputType<'_, TokenProgramInstruction>> for TransferProcessor {
    async fn process(
        &mut self,
        input: &InstructionProcessorInputType<'_, TokenProgramInstruction>,
    ) -> CarbonResult<()> {
        let metadata = &input.metadata.transaction_metadata;

        let (source, destination, authority, amount, checked) = match &input.decoded_instruction {
            // `transferChecked` names its mint, so this is decided on the
            // instruction alone.
            TokenProgramInstruction::TransferChecked { data, accounts, .. } => {
                if accounts.mint.to_string() != MINT {
                    return Ok(());
                }
                (
                    accounts.source,
                    accounts.destination,
                    accounts.authority,
                    data.amount,
                    true,
                )
            }
            // Plain `transfer` names no mint, so the transaction's token
            // balances decide. Either account answers it, because SPL Token
            // rejects a transfer between different mints, and reading only the
            // source would lose the transfers whose source the transaction
            // itself opened — such an account has no balance before it.
            TokenProgramInstruction::Transfer { data, accounts, .. } => {
                if !holds_mint(metadata, &accounts.source.to_string())
                    && !holds_mint(metadata, &accounts.destination.to_string())
                {
                    return Ok(());
                }
                (
                    accounts.source,
                    accounts.destination,
                    accounts.authority,
                    data.amount,
                    false,
                )
            }
            _ => return Ok(()),
        };

        let path = input
            .metadata
            .absolute_path
            .iter()
            .map(|step| step.to_string())
            .collect::<Vec<_>>()
            .join(".");

        let row = Row {
            // Leading with the slot so progress can be read straight off the
            // id, the way it is for every other scenario here.
            id: format!("{}-{}-{}", metadata.slot, metadata.signature, path),
            amount,
            source: source.to_string(),
            destination: destination.to_string(),
            signer: authority.to_string(),
            tx_signature: metadata.signature.to_string(),
            checked,
            slot: metadata.slot as i64,
            timestamp: metadata.block_time.unwrap_or_default(),
        };

        self.sender
            .send(row)
            .await
            .map_err(|e| carbon_core::error::Error::Custom(format!("row writer stopped: {e}")))?;
        Ok(())
    }
}

/// The transaction's account keys as text, in the order token balances index
/// them: the message's own keys, then the writable and readonly addresses its
/// lookup tables loaded. A transfer whose account comes from a lookup table is
/// only findable because of the second half.
fn account_keys(metadata: &TransactionMetadata) -> Vec<String> {
    let mut keys: Vec<String> = metadata
        .message
        .static_account_keys()
        .iter()
        .map(|key| key.to_string())
        .collect();
    for key in &metadata.meta.loaded_addresses.writable {
        keys.push(key.to_string());
    }
    for key in &metadata.meta.loaded_addresses.readonly {
        keys.push(key.to_string());
    }
    keys
}

/// Whether `account` holds the tracked mint anywhere in the transaction's
/// balances — before it, after it, or both.
fn holds_mint(metadata: &TransactionMetadata, account: &str) -> bool {
    let keys = account_keys(metadata);
    let Some(index) = keys.iter().position(|key| key == account) else {
        return false;
    };

    let matches = |balances: &Option<Vec<_>>| {
        balances.as_ref().is_some_and(|balances: &Vec<_>| {
            balances
                .iter()
                .any(|b: &solana_transaction_status::TransactionTokenBalance| {
                    b.account_index as usize == index && b.mint == MINT
                })
        })
    };

    matches(&metadata.meta.pre_token_balances) || matches(&metadata.meta.post_token_balances)
}

async fn write_rows(pool: PgPool, mut receiver: mpsc::Receiver<Row>) {
    let mut batch: Vec<Row> = Vec::with_capacity(BATCH_ROWS);
    let mut ticker = tokio::time::interval(FLUSH_INTERVAL);

    loop {
        tokio::select! {
            row = receiver.recv() => match row {
                Some(row) => {
                    batch.push(row);
                    if batch.len() >= BATCH_ROWS {
                        flush(&pool, &mut batch).await;
                    }
                }
                // The channel is closed: the pipeline is done, so write the
                // tail and stop.
                None => {
                    flush(&pool, &mut batch).await;
                    return;
                }
            },
            _ = ticker.tick() => flush(&pool, &mut batch).await,
        }
    }
}

async fn flush(pool: &PgPool, batch: &mut Vec<Row>) {
    if batch.is_empty() {
        return;
    }

    let mut query = QueryBuilder::new(
        "INSERT INTO transfer \
         (id, amount, source, destination, signer, tx_signature, checked, slot, timestamp) ",
    );
    query.push_values(batch.iter(), |mut values, row| {
        values
            .push_bind(&row.id)
            // NUMERIC takes the u64 amount as text; no bigint would hold it.
            .push_bind(row.amount.to_string())
            .push_unseparated("::numeric")
            .push_bind(&row.source)
            .push_bind(&row.destination)
            .push_bind(&row.signer)
            .push_bind(&row.tx_signature)
            .push_bind(row.checked)
            .push_bind(row.slot)
            .push_bind(row.timestamp);
    });
    // An instruction can be delivered more than once across a restart; the id
    // is what makes that harmless.
    query.push(" ON CONFLICT (id) DO NOTHING");

    if let Err(e) = query.build().execute(pool).await {
        log::error!("failed to write {} rows: {e}", batch.len());
    }
    batch.clear();
}
