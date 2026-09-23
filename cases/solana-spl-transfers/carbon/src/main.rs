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

/// How many `getBlock` calls are in flight at once.
///
/// This is Carbon's own default, stated here rather than left implicit because
/// the row's rate is a function of it. Raising it is a pessimisation, which is
/// worth recording because the opposite is the natural guess: over the
/// scenario's range ten took 210s and fifty took 269s. The endpoint rather than
/// the client is the limit, so asking for more at once only makes the arrivals
/// burstier.
const MAX_CONCURRENT_REQUESTS: usize = 10;

/// How much either of Carbon's two queues may hold: the crawler's own, between
/// fetching a block and decoding it, and the pipeline's, between the datasource
/// and the processors.
///
/// Both default to 1,000, and the datasource does not wait when one is full —
/// it `try_send`s, and on `Full` logs
/// `Error sending transaction update: "Full(..)"` and abandons the rest of that
/// block's transactions. There is no backpressure, so a queue that fills is
/// data quietly missing from the table.
///
/// A thousand is marginal even at the default concurrency: over this range one
/// run came through clean and the next dropped a block. This is what stops it,
/// not the concurrency — at fifty the defaults lost 107 transfers, and at ten
/// they lost 32 on the second of two runs. With the queues raised, ten and
/// fifty both come out exact.
const CHANNEL_BUFFER: usize = 100_000;

/// How many times a batch is retried before the run is failed.
const WRITE_ATTEMPTS: usize = 3;

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
        Some(MAX_CONCURRENT_REQUESTS),
        Some(CHANNEL_BUFFER),
    );

    Pipeline::builder()
        .datasource(datasource)
        .channel_buffer_size(CHANNEL_BUFFER)
        .metrics(Arc::new(LogMetrics::new()))
        .instruction(
            TokenProgramDecoder,
            TransferProcessor { sender, cached: None },
        )
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
    /// The last transaction's resolved account keys and which of them hold the
    /// tracked mint. Instructions arrive grouped by transaction, so one entry
    /// answers nearly every lookup; without it each unchecked transfer walked
    /// the whole account list and base58-encoded every key, which was slow
    /// enough to back the crawler's channel up and make it drop blocks.
    cached: Option<TransactionMints>,
}

struct TransactionMints {
    key: (u64, u64),
    accounts: Vec<[u8; 32]>,
    holding: Vec<bool>,
}

impl TransactionMints {
    fn of(metadata: &TransactionMetadata) -> Self {
        let mut accounts: Vec<[u8; 32]> = metadata
            .message
            .static_account_keys()
            .iter()
            .map(|key| key.to_bytes())
            .collect();
        // Token balances index into the message's own keys followed by the
        // writable and readonly addresses its lookup tables loaded. Without the
        // second half a transfer whose account came from a lookup table would
        // read as a transfer of some other token.
        for key in &metadata.meta.loaded_addresses.writable {
            accounts.push(key.to_bytes());
        }
        for key in &metadata.meta.loaded_addresses.readonly {
            accounts.push(key.to_bytes());
        }

        let mut holding = vec![false; accounts.len()];
        for balances in [&metadata.meta.pre_token_balances, &metadata.meta.post_token_balances]
            .into_iter()
            .flatten()
        {
            for balance in balances {
                if balance.mint == MINT {
                    if let Some(slot) = holding.get_mut(balance.account_index as usize) {
                        *slot = true;
                    }
                }
            }
        }

        Self {
            key: (metadata.slot, metadata.index.unwrap_or_default()),
            accounts,
            holding,
        }
    }

    fn holds(&self, account: &[u8; 32]) -> bool {
        self.accounts
            .iter()
            .position(|key| key == account)
            .is_some_and(|index| self.holding[index])
    }
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
                let key = (metadata.slot, metadata.index.unwrap_or_default());
                if self.cached.as_ref().is_none_or(|cached| cached.key != key) {
                    self.cached = Some(TransactionMints::of(metadata));
                }
                let mints = self.cached.as_ref().expect("just populated");
                if !mints.holds(&accounts.source.to_bytes())
                    && !mints.holds(&accounts.destination.to_bytes())
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
            // id. Every implementation of this case keys rows the same way: the
            // key is stored and indexed, so implementations that disagree about
            // it make the storage column compare primary keys rather than
            // indexers.
            id: format!(
                "{}-{}-{}",
                metadata.slot,
                metadata.index.unwrap_or_default(),
                path
            ),
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

    // The batch is only dropped once it is in the database. Clearing it after a
    // failed insert would lose those transfers silently, and the run would go on
    // to report success over a table with holes in it.
    for attempt in 1..=WRITE_ATTEMPTS {
        match insert(pool, batch).await {
            Ok(()) => {
                batch.clear();
                return;
            }
            Err(e) if attempt < WRITE_ATTEMPTS => {
                log::warn!("write of {} rows failed ({e}); retrying", batch.len());
                tokio::time::sleep(Duration::from_millis(250 * attempt as u64)).await;
            }
            Err(e) => panic!(
                "failed to write {} rows after {WRITE_ATTEMPTS} attempts: {e}",
                batch.len()
            ),
        }
    }
}

async fn insert(pool: &PgPool, batch: &[Row]) -> Result<(), sqlx::Error> {
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
    query.build().execute(pool).await.map(|_| ())
}
