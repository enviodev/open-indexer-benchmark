use super::erc_20indexer::rocket_token_reth::rocket_token_reth_handlers;
            use std::path::PathBuf;
            use rindexer::event::callback_registry::EventCallbackRegistry;

            pub async fn register_all_handlers(manifest_path: &PathBuf) -> EventCallbackRegistry {
                 let mut registry = EventCallbackRegistry::new();
            rocket_token_reth_handlers(manifest_path, &mut registry).await;registry}
