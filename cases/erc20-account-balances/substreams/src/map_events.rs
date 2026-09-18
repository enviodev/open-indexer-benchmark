use crate::pb::evm::balances::v1::{ApprovalEvent, Events, TransferEvent};
use substreams::{skip_empty_output, Hex};
use substreams_ethereum::pb::eth::v2::Block;

/// `Transfer(address,address,uint256)`
const TRANSFER_TOPIC: [u8; 32] = [
    0xdd, 0xf2, 0x52, 0xad, 0x1b, 0xe2, 0xc8, 0x9b, 0x69, 0xc2, 0xb0, 0x68, 0xfc, 0x37, 0x8d, 0xaa,
    0x95, 0x2b, 0xa7, 0xf1, 0x63, 0xc4, 0xa1, 0x16, 0x28, 0xf5, 0x5a, 0x4d, 0xf5, 0x23, 0xb3, 0xef,
];

/// `Approval(address,address,uint256)`
const APPROVAL_TOPIC: [u8; 32] = [
    0x8c, 0x5b, 0xe1, 0xe5, 0xeb, 0xec, 0x7d, 0x5b, 0xd1, 0x4f, 0x71, 0x42, 0x7d, 0x1e, 0x84, 0xf3,
    0xdd, 0x03, 0x14, 0xc0, 0xf7, 0xb2, 0x29, 0x1e, 0x5b, 0x20, 0x0a, 0xc8, 0xc7, 0xc3, 0xb9, 0x25,
];

#[substreams::handlers::map]
fn map_events(params: String, block: Block) -> Result<Events, substreams::errors::Error> {
    skip_empty_output();

    let contract = params
        .split_once(':')
        .map(|(_, address)| address.trim_start_matches("0x").to_lowercase())
        .expect("params must be of the form contract:<address>");
    let contract = hex::decode(contract).expect("contract must be hex");

    let number = block.number;
    let timestamp = block.timestamp_seconds() as i64;

    let mut events = Events::default();
    for log in block.logs() {
        let log = log.log;
        if log.address != contract || log.topics.len() != 3 || log.data.len() != 32 {
            continue;
        }
        let id = format!("{}-{}", number, log.block_index);
        let amount = substreams::scalar::BigInt::from_unsigned_bytes_be(&log.data).to_string();
        let first = format!("0x{}", Hex(&log.topics[1][12..]));
        let second = format!("0x{}", Hex(&log.topics[2][12..]));

        if log.topics[0] == TRANSFER_TOPIC {
            events.transfers.push(TransferEvent {
                id,
                amount,
                from_address: first,
                to_address: second,
                block_timestamp: timestamp,
            });
        } else if log.topics[0] == APPROVAL_TOPIC {
            events.approvals.push(ApprovalEvent {
                id,
                amount,
                owner_address: first,
                spender_address: second,
                block_timestamp: timestamp,
            });
        }
    }

    Ok(events)
}
