use super::erc_20indexer::erc_20::erc_20_handlers;
use rindexer::event::callback_registry::EventCallbackRegistry;
use std::path::PathBuf;

pub async fn register_all_handlers(manifest_path: &PathBuf) -> EventCallbackRegistry {
    let mut registry = EventCallbackRegistry::new();
    erc_20_handlers(manifest_path, &mut registry).await;
    registry
}
