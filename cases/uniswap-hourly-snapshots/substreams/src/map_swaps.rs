use crate::pb::evm::swaps::v1::{Swap, Swaps};
use substreams::scalar::BigInt;
use substreams_ethereum::pb::eth::v2::Block;

/// `Swap(address,address,int256,int256,uint160,uint128,int24)`
const SWAP_TOPIC: [u8; 32] = [
    0xc4, 0x20, 0x79, 0xf9, 0x4a, 0x63, 0x50, 0xd7, 0xe6, 0x23, 0x5f, 0x29, 0x17, 0x49, 0x24, 0xf9,
    0x28, 0xcc, 0x2a, 0xc8, 0x18, 0xeb, 0x64, 0xfe, 0xd8, 0x00, 0x4e, 0x11, 0x5f, 0xbc, 0xca, 0x67,
];

/// The n-th 32-byte word of a log's data payload.
fn word(data: &[u8], index: usize) -> &[u8] {
    &data[index * 32..(index + 1) * 32]
}

#[substreams::handlers::map]
fn map_swaps(params: String, block: Block) -> Result<Swaps, substreams::errors::Error> {
    let pool = params
        .split_once(':')
        .map(|(_, address)| address.trim_start_matches("0x").to_lowercase())
        .expect("params must be of the form pool:<address>");
    let pool = hex::decode(pool).expect("pool must be hex");

    let number = block.number;
    let timestamp = block.timestamp_seconds() as i64;

    let mut swaps = Swaps::default();
    for log in block.logs() {
        let log = log.log;
        if log.address != pool
            || log.topics.len() != 3
            || log.topics[0] != SWAP_TOPIC
            || log.data.len() != 5 * 32
        {
            continue;
        }
        // Data: int256 amount0, int256 amount1, uint160 sqrtPriceX96,
        // uint128 liquidity, int24 tick — each padded to a word, the signed
        // ones sign-extended.
        swaps.swaps.push(Swap {
            id: format!("{}-{}", number, log.block_index),
            amount0: BigInt::from_signed_bytes_be(word(&log.data, 0)).to_string(),
            amount1: BigInt::from_signed_bytes_be(word(&log.data, 1)).to_string(),
            sqrt_price_x96: BigInt::from_unsigned_bytes_be(word(&log.data, 2)).to_string(),
            tick: BigInt::from_signed_bytes_be(word(&log.data, 4)).to_string(),
            timestamp,
            ordinal: log.ordinal,
        });
    }

    Ok(swaps)
}
