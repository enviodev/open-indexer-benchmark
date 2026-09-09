use crate::map_proxies::{address_at_word, uint_at_word};
use crate::pb::evm::safes::v1::{
    AddressEvent, Events, ModuleTransaction, MultiSigTransaction, Payment, SafeReceived, SafeSetup,
    Threshold,
};
use substreams::store::{StoreGet, StoreGetInt64};
use substreams::{skip_empty_output, Hex};
use substreams_ethereum::pb::eth::v2::Block;

/// The events a Safe proxy emits. One topic0 each, and the same set the case's
/// ground truth reads.
mod topic {
    pub const SAFE_SETUP: &str = "141df868a6331af528e38c83b7aa03edc19be66e37ae67f9285bf4f8e3c6a1a8";
    pub const SAFE_RECEIVED: &str = "3d0ce9bfc3ed7d6862dbb28b2dea94561fe714a1b4d019aa8af39730d1ad7c3d";
    pub const MODULE_TX: &str = "b648d3644f584ed1c2232d53c46d87e693586486ad0d1175f8656013110b714e";
    pub const MULTISIG_TX: &str = "66753cd2356569ee081232e3be8909b950e0a76c1f8460c3a5e3c2be32b11bed";
    pub const EXECUTION_SUCCESS: &str =
        "442e715f626346e8c54381002da614f62bee8d27386535b2521ec8540898556e";
    pub const EXECUTION_FAILURE: &str =
        "23428b18acfb3ea64b08dc0c1d296ea9c09702c09083ca5272e64d115b687d23";
    pub const CHANGED_THRESHOLD: &str =
        "610f7ff2b304ae8903c3de74c60c6ab1f7d6226b3f52c5161905bb5ad4039c93";
    pub const CHANGED_MASTER_COPY: &str =
        "75e41bc35ff1bf14d81d1d2f649c0084a0f974f9289c803ec9898eeec4c8d0b8";
    pub const CHANGED_FALLBACK_HANDLER: &str =
        "5ac6c46c93c8d0e53714ba3b53db3e7c046da994313d7ed0d192028bc7c228b0";
    pub const CHANGED_GUARD: &str =
        "1151116914515bc0891ff9047a6cb32cf902546f83066499bcf8ba33d2353fa2";
    pub const CHANGED_MODULE_GUARD: &str =
        "cd1966d6be16bc0c030cc741a06c6e0efaf8d00de2c8b6a9e11827e125de8bb8";
    pub const ENABLED_MODULE: &str =
        "ecdf3a3effea5783a3c4c2140e677577666428d44ed9d474a0b3a4c9943f8440";
    pub const DISABLED_MODULE: &str =
        "aab4fa2b463f581b2b32cb3b7e3b704b9ce37cc209b5fb4d77e593ace4054276";
    pub const ADDED_OWNER: &str = "9465fa0c962cc76958e6373a993326400c1c94f8be2fe3a952adfa7f60b2ea26";
    pub const REMOVED_OWNER: &str =
        "f8d49fc529812e9a7c5c50e69c20f0dccc0db8fa95c98bc58cc9a4f1c1299eaf";
}

/// The eight events that carry one address and nothing else, as the table they
/// land in and what that table calls the column.
const ADDRESS_EVENTS: [(&str, &str, &str); 8] = [
    (topic::CHANGED_MASTER_COPY, "changed_master_copy", "singleton"),
    (topic::CHANGED_FALLBACK_HANDLER, "changed_fallback_handler", "handler"),
    (topic::CHANGED_GUARD, "changed_guard", "guard"),
    (topic::CHANGED_MODULE_GUARD, "changed_module_guard", "module_guard"),
    (topic::ENABLED_MODULE, "enabled_module", "module"),
    (topic::DISABLED_MODULE, "disabled_module", "module"),
    (topic::ADDED_OWNER, "added_owner", "owner"),
    (topic::REMOVED_OWNER, "removed_owner", "owner"),
];

#[substreams::handlers::map]
fn map_events(block: Block, proxies: StoreGetInt64) -> Result<Events, substreams::errors::Error> {
    skip_empty_output();

    let timestamp = block.timestamp_seconds() as i64;
    let mut events = Events::default();

    for log in block.logs() {
        let log = log.log;
        let safe = format!("0x{}", Hex(&log.address));
        // Only a proxy one of these factories announced counts as a child.
        // `get_last` rather than `get_at(0, ..)`: the latter reads the store as
        // it stood before this block's writes, so a proxy created in this very
        // block would not be known yet — and a Safe emits its own SafeSetup one
        // log index *below* the ProxyCreation announcing it, which is the case
        // this scenario exists to make visible.
        if proxies.get_last(&safe).is_none() {
            continue;
        }
        let Some(topic0) = log.topics.first() else {
            continue;
        };
        let topic0 = Hex(topic0).to_string();
        let id = format!("{}-{}", block.number, log.block_index);
        let arg0 = || log.topics.get(1).map(|t| format!("0x{}", Hex(&t[12..])));

        // An address argument sits in the payload before 1.4.x and in topic1
        // after it. An empty payload is the tell: it can only have gone to a
        // topic.
        let sole_address = || {
            if log.data.len() >= 32 {
                address_at_word(&log.data, 0)
            } else {
                arg0()
            }
        };

        match topic0.as_str() {
            topic::SAFE_SETUP => {
                let (Some(initiator), Some(threshold)) = (arg0(), uint_at_word(&log.data, 1)) else {
                    continue;
                };
                events.setups.push(SafeSetup {
                    id,
                    safe,
                    initiator,
                    threshold,
                    block_timestamp: timestamp,
                });
            }
            topic::SAFE_RECEIVED => {
                let (Some(sender), Some(value)) = (arg0(), uint_at_word(&log.data, 0)) else {
                    continue;
                };
                events.received.push(SafeReceived {
                    id,
                    safe,
                    sender,
                    value,
                    block_timestamp: timestamp,
                });
            }
            topic::MODULE_TX => {
                // `bytes data` in the middle is a head-and-tail encoding, so
                // word 3 is only its offset and `operation` follows at word 4.
                let (Some(module), Some(to), Some(value), Some(operation)) = (
                    address_at_word(&log.data, 0),
                    address_at_word(&log.data, 1),
                    uint_at_word(&log.data, 2),
                    uint_at_word(&log.data, 4),
                ) else {
                    continue;
                };
                events.module_transactions.push(ModuleTransaction {
                    id,
                    safe,
                    module,
                    to,
                    value,
                    operation,
                    block_timestamp: timestamp,
                });
            }
            topic::MULTISIG_TX => {
                // Same head-and-tail rule: `data` is word 2's offset, so
                // `operation` is word 3.
                let (Some(to), Some(value), Some(operation)) = (
                    address_at_word(&log.data, 0),
                    uint_at_word(&log.data, 1),
                    uint_at_word(&log.data, 3),
                ) else {
                    continue;
                };
                events.multisig_transactions.push(MultiSigTransaction {
                    id,
                    safe,
                    to,
                    value,
                    operation,
                    block_timestamp: timestamp,
                });
            }
            topic::EXECUTION_SUCCESS | topic::EXECUTION_FAILURE => {
                // Both layouts carry at least one word and the payment is the
                // last of them, so an empty payload is a truncated log rather
                // than a layout this has not met — dropping it beats reading a
                // payment of zero into the checksum.
                let words = log.data.len() / 32;
                let Some(payment) = words.checked_sub(1).and_then(|w| uint_at_word(&log.data, w))
                else {
                    continue;
                };
                let table = if topic0 == topic::EXECUTION_SUCCESS {
                    "execution_success"
                } else {
                    "execution_failure"
                };
                events.executions.push(Payment {
                    id,
                    table: table.to_string(),
                    safe,
                    payment,
                    block_timestamp: timestamp,
                });
            }
            topic::CHANGED_THRESHOLD => {
                let Some(threshold) = uint_at_word(&log.data, 0) else {
                    continue;
                };
                events.thresholds.push(Threshold {
                    id,
                    safe,
                    threshold,
                    block_timestamp: timestamp,
                });
            }
            other => {
                let Some((_, table, column)) =
                    ADDRESS_EVENTS.iter().find(|(topic, _, _)| *topic == other)
                else {
                    continue;
                };
                let Some(address) = sole_address() else {
                    continue;
                };
                events.address_events.push(AddressEvent {
                    id,
                    table: table.to_string(),
                    column: column.to_string(),
                    safe,
                    address,
                    block_timestamp: timestamp,
                });
            }
        }
    }

    Ok(events)
}
