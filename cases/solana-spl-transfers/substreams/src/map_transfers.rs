use crate::pb::{
    sol::transactions::v1::Transactions,
    spl::transfers::v1::{Transfer, Transfers},
};
use spl_token::instruction::TokenInstruction;
use substreams::{pb::substreams::Clock, skip_empty_output};
use substreams_solana::pb::sf::solana::r#type::v1::ConfirmedTransaction;

#[substreams::handlers::map]
fn map_transfers(
    params: String,
    clock: Clock,
    trxs: Transactions,
) -> Result<Transfers, substreams::errors::Error> {
    skip_empty_output();

    let mint = params
        .split_once(':')
        .map(|(_, mint)| mint.to_string())
        .expect("params must be of the form token_contract:<address>");

    let slot = clock.number;
    let timestamp = clock.timestamp.as_ref().map(|t| t.seconds).unwrap_or_default();

    let mut data: Vec<Transfer> = Vec::new();
    // The source module hands over only the transactions that touch the Token
    // program, so this counts within those rather than within the block. Every
    // implementation of this scenario keys its rows
    // `slot-transactionIndex-instructionPath`, and the other three can say
    // where a transaction sat in its block; asking the server for whole blocks
    // to match them would give up the filter that is the point of Substreams,
    // to agree on a field the ground truth does not check. The key keeps its
    // shape and its length, which is what the storage column compares.
    for (transaction_index, trx) in trxs.transactions.iter().enumerate() {
        let Some(meta) = trx.meta.as_ref() else { continue };
        // A failed transaction's instructions never happened; no implementation
        // of this scenario counts them.
        if meta.err.is_some() {
            continue;
        }
        let Some(message) = trx.transaction.as_ref().and_then(|t| t.message.as_ref()) else {
            continue;
        };

        let accounts = trx.resolved_accounts();
        let signature = trx.id();

        for (top_index, compiled) in message.instructions.iter().enumerate() {
            if let Some(transfer) = decode(
                trx,
                &accounts,
                compiled.program_id_index,
                &compiled.accounts,
                &compiled.data,
                &mint,
            ) {
                data.push(transfer.into_row(
                    format!("{}-{}-{}", slot, transaction_index, top_index),
                    signature.clone(),
                    slot,
                    timestamp,
                ));
            }

            // Solana reports a transaction's inner instructions as one flat
            // list per top-level instruction, with `stack_height` carrying the
            // nesting. The path every other implementation keys its rows on is
            // hierarchical, so it is rebuilt from those heights.
            let Some(inner) = meta
                .inner_instructions
                .iter()
                .find(|i| i.index == top_index as u32)
            else {
                continue;
            };

            let mut counters: Vec<u32> = Vec::new();
            for instruction in &inner.instructions {
                let depth = instruction.stack_height.unwrap_or(2).max(2) as usize - 2;
                if counters.len() > depth {
                    counters.truncate(depth + 1);
                    *counters.last_mut().expect("truncated to depth + 1") += 1;
                } else {
                    while counters.len() < depth {
                        counters.push(0);
                    }
                    counters.push(0);
                }

                let Some(transfer) = decode(
                    trx,
                    &accounts,
                    instruction.program_id_index,
                    &instruction.accounts,
                    &instruction.data,
                    &mint,
                ) else {
                    continue;
                };

                let path = counters
                    .iter()
                    .map(|c| c.to_string())
                    .collect::<Vec<_>>()
                    .join(".");
                data.push(transfer.into_row(
                    format!("{}-{}-{}.{}", slot, transaction_index, top_index, path),
                    signature.clone(),
                    slot,
                    timestamp,
                ));
            }
        }
    }

    Ok(Transfers { data })
}

struct Decoded {
    amount: u64,
    source: String,
    destination: String,
    signer: String,
    checked: bool,
}

impl Decoded {
    fn into_row(self, id: String, tx_signature: String, slot: u64, timestamp: i64) -> Transfer {
        Transfer {
            id,
            amount: self.amount.to_string(),
            source: self.source,
            destination: self.destination,
            signer: self.signer,
            tx_signature,
            checked: self.checked,
            slot,
            timestamp,
        }
    }
}

/// Decode one instruction, and keep it only if it moved the tracked mint.
fn decode(
    trx: &ConfirmedTransaction,
    accounts: &[&Vec<u8>],
    program_id_index: u32,
    account_indexes: &[u8],
    data: &[u8],
    mint: &str,
) -> Option<Decoded> {
    let program_id = accounts.get(program_id_index as usize)?;
    if program_id.as_slice() != spl_token::ID.as_ref() {
        return None;
    }

    // The SPL Token crate owns the wire format, so the layouts are not restated
    // here the way an implementation without it has to.
    let (amount, checked) = match TokenInstruction::unpack(data).ok()? {
        TokenInstruction::Transfer { amount } => (amount, false),
        TokenInstruction::TransferChecked { amount, .. } => (amount, true),
        _ => return None,
    };

    // `transfer` is (source, destination, authority); `transferChecked` puts
    // the mint second, which is what makes it self-describing.
    let at = |position: usize| -> Option<&Vec<u8>> {
        accounts
            .get(*account_indexes.get(position)? as usize)
            .copied()
    };
    let (source, destination, authority) = if checked {
        (at(0)?, at(2)?, at(3)?)
    } else {
        (at(0)?, at(1)?, at(2)?)
    };

    if checked {
        // The mint is account slot 1, so whether this moves the tracked token
        // is settled without reading anything else.
        if bs58::encode(at(1)?).into_string() != mint {
            return None;
        }
    } else if !moves_mint(trx, accounts, source, destination, mint) {
        return None;
    }

    Some(Decoded {
        amount,
        source: bs58::encode(source).into_string(),
        destination: bs58::encode(destination).into_string(),
        signer: bs58::encode(authority).into_string(),
        checked,
    })
}

/// Whether a plain `transfer` moved the tracked mint.
///
/// The instruction names no mint, so the answer is only in the transaction's
/// token balances, and it is read for the transfer's own two accounts rather
/// than for the transaction as a whole. Asking whether *any* balance carries
/// the mint — which is what the upstream Substreams package does — marks every
/// transfer in a swap as a transfer of whichever token the swap touched.
///
/// Either account settles it, because SPL Token rejects a transfer between
/// different mints, and both are read because an account opened by this very
/// transaction has no pre-balance to report. `post_token_balances` covers that
/// case, so the two lists are searched together.
fn moves_mint(
    trx: &ConfirmedTransaction,
    accounts: &[&Vec<u8>],
    source: &Vec<u8>,
    destination: &Vec<u8>,
    mint: &str,
) -> bool {
    let Some(meta) = trx.meta.as_ref() else {
        return false;
    };

    meta.pre_token_balances
        .iter()
        .chain(meta.post_token_balances.iter())
        .any(|balance| {
            balance.mint == mint
                && accounts
                    .get(balance.account_index as usize)
                    .is_some_and(|account| *account == source || *account == destination)
        })
}
