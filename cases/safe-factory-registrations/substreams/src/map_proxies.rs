use crate::pb::evm::safes::v1::{Proxies, Safe};
use substreams::{skip_empty_output, Hex};
use substreams_ethereum::pb::eth::v2::Block;

/// `ProxyCreation(address proxy, address singleton)`, and the same signature
/// with `proxy` indexed from 1.4.1 on — one topic0 either way, which is why the
/// layouts are told apart by the factory that emitted the log.
pub const PROXY_CREATION_TOPIC: [u8; 32] = [
    0x4f, 0x51, 0xfa, 0xf6, 0xc4, 0x56, 0x1f, 0xf9, 0x5f, 0x06, 0x76, 0x57, 0xe4, 0x34, 0x39, 0xf0,
    0xf8, 0x56, 0xd9, 0x7c, 0x04, 0xd9, 0xec, 0x90, 0x70, 0xa6, 0x19, 0x9a, 0xd4, 0x18, 0xe2, 0x35,
];

/// `ProxyCreation(address proxy, address singleton)` — both arguments in the
/// data payload, proxy first.
const FACTORIES_V1_3_0: [&str; 2] = [
    "a6b71e26c5e0845f74c812102ca7114b6a896ab2",
    "c22834581ebc8527d974f8a1c97e1bea4ef910bc",
];

/// `ProxyCreation(address indexed proxy, address singleton)` — proxy moved into
/// a topic in 1.4.1 and stayed there, so the payload holds the singleton alone.
const FACTORIES_MODERN: [&str; 2] = [
    "4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67",
    "14f2982d601c9458f93bd70b218933a6f8165e7b",
];

/// The 32-byte word at `index`, as the low 20 bytes an address occupies.
pub fn address_at_word(data: &[u8], index: usize) -> Option<String> {
    let word = data.get(index * 32..(index + 1) * 32)?;
    Some(format!("0x{}", Hex(&word[12..])))
}

/// The 32-byte word at `index`, as a decimal integer.
pub fn uint_at_word(data: &[u8], index: usize) -> Option<String> {
    let word = data.get(index * 32..(index + 1) * 32)?;
    Some(substreams::scalar::BigInt::from_unsigned_bytes_be(word).to_string())
}

#[substreams::handlers::map]
fn map_proxies(block: Block) -> Result<Proxies, substreams::errors::Error> {
    skip_empty_output();

    let timestamp = block.timestamp_seconds() as i64;
    let mut data: Vec<Safe> = Vec::new();

    for log in block.logs() {
        let log = log.log;
        if log.topics.first().map(|t| t.as_slice()) != Some(&PROXY_CREATION_TOPIC) {
            continue;
        }
        let factory = Hex(&log.address).to_string();
        let legacy = FACTORIES_V1_3_0.contains(&factory.as_str());
        if !legacy && !FACTORIES_MODERN.contains(&factory.as_str()) {
            continue;
        }

        // The proxy is data word 0 before 1.4.1 and topic1 after it; the
        // singleton is the word after the proxy, wherever the proxy went.
        let (proxy, singleton) = if legacy {
            (address_at_word(&log.data, 0), address_at_word(&log.data, 1))
        } else {
            let proxy = log
                .topics
                .get(1)
                .map(|t| format!("0x{}", Hex(&t[12..])));
            (proxy, address_at_word(&log.data, 0))
        };
        let (Some(proxy), Some(singleton)) = (proxy, singleton) else {
            continue;
        };

        data.push(Safe {
            id: format!("{}-{}", block.number, log.block_index),
            proxy,
            singleton,
            block_timestamp: timestamp,
        });
    }

    Ok(Proxies { data })
}
