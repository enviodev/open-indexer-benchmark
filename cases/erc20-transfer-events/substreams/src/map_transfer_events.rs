use crate::pb::evm::transfers::v1::{TransferEvent, TransferEvents};
use substreams::{skip_empty_output, Hex};
use substreams_ethereum::pb::eth::v2::Block;

/// `Transfer(address,address,uint256)`
const TRANSFER_TOPIC: [u8; 32] = [
    0xdd, 0xf2, 0x52, 0xad, 0x1b, 0xe2, 0xc8, 0x9b, 0x69, 0xc2, 0xb0, 0x68, 0xfc, 0x37, 0x8d, 0xaa,
    0x95, 0x2b, 0xa7, 0xf1, 0x63, 0xc4, 0xa1, 0x16, 0x28, 0xf5, 0x5a, 0x4d, 0xf5, 0x23, 0xb3, 0xef,
];

#[substreams::handlers::map]
fn map_transfer_events(
    params: String,
    block: Block,
) -> Result<TransferEvents, substreams::errors::Error> {
    skip_empty_output();

    let contract = params
        .split_once(':')
        .map(|(_, address)| address.trim_start_matches("0x").to_lowercase())
        .expect("params must be of the form contract:<address>");
    let contract = hex::decode(contract).expect("contract must be hex");

    let number = block.number;
    let timestamp = block.timestamp_seconds() as i64;

    let mut data: Vec<TransferEvent> = Vec::new();
    // `logs()` walks the successful transactions' receipts in order, so a
    // reverted call's logs never arrive here and the log index is the block's
    // own. Every implementation of this scenario keys its rows
    // `blockNumber-logIndex`, which is what keeps the storage column comparing
    // indexers rather than primary keys.
    for log in block.logs() {
        let log = log.log;
        if log.address != contract {
            continue;
        }
        // Topics are (signature, from, to) and the value is the data word.
        // An ERC-20 whose Transfer is non-standard — three indexed arguments,
        // or none — would decode to something else, so the shape is checked
        // rather than assumed.
        if log.topics.len() != 3 || log.topics[0] != TRANSFER_TOPIC || log.data.len() != 32 {
            continue;
        }

        data.push(TransferEvent {
            id: format!("{}-{}", number, log.block_index),
            amount: substreams::scalar::BigInt::from_unsigned_bytes_be(&log.data).to_string(),
            from_address: format!("0x{}", Hex(&log.topics[1][12..])),
            to_address: format!("0x{}", Hex(&log.topics[2][12..])),
            block_timestamp: timestamp,
        });
    }

    Ok(TransferEvents { data })
}
