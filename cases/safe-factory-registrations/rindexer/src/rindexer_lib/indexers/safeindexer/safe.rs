// Handlers for the Safe factory-registration case.
//
// The manifest registers the protocol as eight contracts (see rindexer.yaml
// for why: two factory generations, and ten child events that exist under one
// topic0 in two layouts). Every registration funnels into one hand-owned table
// set in the `safe_case` schema, shaped exactly as the case verifies:
// `disable_create_tables` keeps rindexer's per-contract event tables out of
// the database, so these are the only tables the verifier can resolve.
//
// A wrong-layout log fails its registration's decode and is skipped by that
// registration; the sibling registration with the other layout decodes it.
// Each log therefore lands exactly once, and no dedup is needed here.
use std::sync::Arc;

use alloy::primitives::Address;
use rindexer::{
    event::callback_registry::EventCallbackRegistry, rindexer_error, EthereumSqlTypeWrapper,
    PostgresClient,
};
use std::path::PathBuf;
use tokio::sync::OnceCell;

const SCHEMA: &str = "safe_case";

/// `drop_each_run` wipes the schema before indexing starts, so the case's
/// tables are created on the first batch rather than at startup.
static CASE_TABLES: OnceCell<()> = OnceCell::const_new();

/// `get_or_try_init` so a failed CREATE is retried rather than remembered as
/// done (see the allowance case's handler for the full reasoning).
async fn ensure_case_tables(database: &Arc<PostgresClient>) -> Result<(), String> {
    CASE_TABLES
        .get_or_try_init(|| async {
            // Address columns CHAR(42), uint256 its decimal string, block
            // number NUMERIC — the types rindexer's binary bulk insert writes.
            // `block_number` is what the benchmark reads progress from.
            let address_events = [
                ("changed_master_copy", "singleton"),
                ("changed_fallback_handler", "handler"),
                ("changed_guard", "guard"),
                ("changed_module_guard", "module_guard"),
                ("enabled_module", "module"),
                ("disabled_module", "module"),
                ("added_owner", "owner"),
                ("removed_owner", "owner"),
            ];
            let mut statements = vec![
                format!("CREATE SCHEMA IF NOT EXISTS {SCHEMA}"),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.safe (
                         proxy CHAR(42) NOT NULL,
                         singleton CHAR(42) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.safe_setup (
                         safe CHAR(42) NOT NULL,
                         initiator CHAR(42) NOT NULL,
                         threshold VARCHAR(78) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.safe_received (
                         safe CHAR(42) NOT NULL,
                         sender CHAR(42) NOT NULL,
                         value VARCHAR(78) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.safe_module_transaction (
                         safe CHAR(42) NOT NULL,
                         module CHAR(42) NOT NULL,
                         \"to\" CHAR(42) NOT NULL,
                         value VARCHAR(78) NOT NULL,
                         operation SMALLINT NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.safe_multi_sig_transaction (
                         safe CHAR(42) NOT NULL,
                         \"to\" CHAR(42) NOT NULL,
                         value VARCHAR(78) NOT NULL,
                         operation SMALLINT NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.execution_success (
                         safe CHAR(42) NOT NULL,
                         payment VARCHAR(78) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.execution_failure (
                         safe CHAR(42) NOT NULL,
                         payment VARCHAR(78) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
                format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.changed_threshold (
                         safe CHAR(42) NOT NULL,
                         threshold VARCHAR(78) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ),
            ];
            for (table, column) in address_events {
                statements.push(format!(
                    "CREATE TABLE IF NOT EXISTS {SCHEMA}.{table} (
                         safe CHAR(42) NOT NULL,
                         {column} CHAR(42) NOT NULL,
                         block_number NUMERIC NOT NULL,
                         block_timestamp TIMESTAMPTZ
                     )"
                ));
            }
            for statement in statements {
                if let Err(e) = database.execute(&statement, &[]).await {
                    return Err(format!("creating the case's tables: {e:?}"));
                }
            }
            Ok(())
        })
        .await
        .map(|_| ())
}

/// Bulk insert into one of the case's tables.
async fn insert_rows(
    database: &Arc<PostgresClient>,
    table: &str,
    columns: &[&str],
    rows: Vec<Vec<EthereumSqlTypeWrapper>>,
) -> Result<(), String> {
    if rows.is_empty() {
        return Ok(());
    }
    // insert_bulk quotes every identifier itself, `to` included.
    let names: Vec<String> = columns.iter().map(|c| c.to_string()).collect();
    database
        .insert_bulk(&format!("{SCHEMA}.{table}"), &names, &rows)
        .await
        .map_err(|e| {
            rindexer_error!("inserting into {}: {:?}", table, e);
            e.to_string()
        })
}

fn meta(
    address: Address,
    block_number: u64,
    timestamp: EthereumSqlTypeWrapper,
) -> [EthereumSqlTypeWrapper; 3] {
    [
        EthereumSqlTypeWrapper::Address(address),
        EthereumSqlTypeWrapper::U64(block_number),
        timestamp,
    ]
}

/// One row: the emitting safe, the event's own values, block number, timestamp.
macro_rules! rows {
    ($results:ident, |$r:ident| [$($value:expr),*]) => {
        $results
            .iter()
            .map(|$r| {
                let [safe, block, at] = meta(
                    $r.tx_information.address,
                    $r.tx_information.block_number,
                    EthereumSqlTypeWrapper::DateTimeNullable(
                        $r.tx_information.block_timestamp_to_datetime(),
                    ),
                );
                let mut row = vec![safe];
                $(row.push($value);)*
                row.push(block);
                row.push(at);
                row
            })
            .collect::<Vec<_>>()
    };
}

/// Registers one event of one generated contract module: the closure extracts
/// the event's values, everything else is shared.
macro_rules! register {
    ($manifest:ident, $registry:ident, $module:ident, $etype:ident, $variant:ident, $event:ident,
     $table:expr, [$($col:expr),*], |$r:ident| [$($value:expr),*]) => {{
        use crate::rindexer_lib::typings::safeindexer::events::$module::{$etype, $event};
        let handler = $event::handler(
            |results, context| async move {
                if results.is_empty() {
                    return Ok(());
                }
                ensure_case_tables(&context.database).await?;
                let data = rows!(results, |$r| [$($value),*]);
                insert_rows(
                    &context.database,
                    $table,
                    &["safe", $($col,)* "block_number", "block_timestamp"],
                    data,
                )
                .await
            },
            crate::rindexer_lib::typings::safeindexer::events::$module::no_extensions(),
        )
        .await;
        $etype::$variant(handler).register($manifest, $registry).await;
    }};
}

/// The factory event stores the created proxy rather than the emitter.
macro_rules! register_proxy_creation {
    ($manifest:ident, $registry:ident, $module:ident, $etype:ident) => {{
        use crate::rindexer_lib::typings::safeindexer::events::$module::{
            $etype, ProxyCreationEvent,
        };
        let handler = ProxyCreationEvent::handler(
            |results, context| async move {
                if results.is_empty() {
                    return Ok(());
                }
                ensure_case_tables(&context.database).await?;
                let data = results
                    .iter()
                    .map(|r| {
                        vec![
                            EthereumSqlTypeWrapper::Address(r.event_data.proxy),
                            EthereumSqlTypeWrapper::Address(r.event_data.singleton),
                            EthereumSqlTypeWrapper::U64(r.tx_information.block_number),
                            EthereumSqlTypeWrapper::DateTimeNullable(
                                r.tx_information.block_timestamp_to_datetime(),
                            ),
                        ]
                    })
                    .collect::<Vec<_>>();
                insert_rows(
                    &context.database,
                    "safe",
                    &["proxy", "singleton", "block_number", "block_timestamp"],
                    data,
                )
                .await
            },
            crate::rindexer_lib::typings::safeindexer::events::$module::no_extensions(),
        )
        .await;
        $etype::ProxyCreation(handler)
            .register($manifest, $registry)
            .await;
    }};
}

/// The five events whose layout never changed, registered once per factory
/// generation's child set.
macro_rules! register_common {
    ($manifest:ident, $registry:ident, $module:ident, $etype:ident) => {{
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            SafeSetup,
            SafeSetupEvent,
            "safe_setup",
            ["initiator", "threshold"],
            |r| [
                EthereumSqlTypeWrapper::Address(r.event_data.initiator),
                EthereumSqlTypeWrapper::U256(r.event_data.threshold)
            ]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            SafeReceived,
            SafeReceivedEvent,
            "safe_received",
            ["sender", "value"],
            |r| [
                EthereumSqlTypeWrapper::Address(r.event_data.sender),
                EthereumSqlTypeWrapper::U256(r.event_data.value)
            ]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            SafeModuleTransaction,
            SafeModuleTransactionEvent,
            "safe_module_transaction",
            ["module", "to", "value", "operation"],
            |r| [
                EthereumSqlTypeWrapper::Address(r.event_data.module),
                EthereumSqlTypeWrapper::Address(r.event_data.to),
                EthereumSqlTypeWrapper::U256(r.event_data.value),
                EthereumSqlTypeWrapper::U8(r.event_data.operation)
            ]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            SafeMultiSigTransaction,
            SafeMultiSigTransactionEvent,
            "safe_multi_sig_transaction",
            ["to", "value", "operation"],
            |r| [
                EthereumSqlTypeWrapper::Address(r.event_data.to),
                EthereumSqlTypeWrapper::U256(r.event_data.value),
                EthereumSqlTypeWrapper::U8(r.event_data.operation)
            ]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ChangedThreshold,
            ChangedThresholdEvent,
            "changed_threshold",
            ["threshold"],
            |r| [EthereumSqlTypeWrapper::U256(r.event_data.threshold)]
        );
    }};
}

/// The ten dual-layout events. The same expansion serves both layout modules:
/// the generated field names are identical, only the indexing differs.
macro_rules! register_dual {
    ($manifest:ident, $registry:ident, $module:ident, $etype:ident) => {{
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ExecutionSuccess,
            ExecutionSuccessEvent,
            "execution_success",
            ["payment"],
            |r| [EthereumSqlTypeWrapper::U256(r.event_data.payment)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ExecutionFailure,
            ExecutionFailureEvent,
            "execution_failure",
            ["payment"],
            |r| [EthereumSqlTypeWrapper::U256(r.event_data.payment)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ChangedMasterCopy,
            ChangedMasterCopyEvent,
            "changed_master_copy",
            ["singleton"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.masterCopy)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ChangedFallbackHandler,
            ChangedFallbackHandlerEvent,
            "changed_fallback_handler",
            ["handler"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.handler)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ChangedGuard,
            ChangedGuardEvent,
            "changed_guard",
            ["guard"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.guard)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            ChangedModuleGuard,
            ChangedModuleGuardEvent,
            "changed_module_guard",
            ["module_guard"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.moduleGuard)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            EnabledModule,
            EnabledModuleEvent,
            "enabled_module",
            ["module"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.module)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            DisabledModule,
            DisabledModuleEvent,
            "disabled_module",
            ["module"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.module)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            AddedOwner,
            AddedOwnerEvent,
            "added_owner",
            ["owner"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.owner)]
        );
        register!(
            $manifest,
            $registry,
            $module,
            $etype,
            RemovedOwner,
            RemovedOwnerEvent,
            "removed_owner",
            ["owner"],
            |r| [EthereumSqlTypeWrapper::Address(r.event_data.owner)]
        );
    }};
}

/// The factory-sync registrations. rindexer only builds the pipeline that
/// discovers and registers children for a factory event that is itself
/// registered, so each generation's ProxyCreation gets a no-op handler — the
/// child bookkeeping happens inside rindexer after the callback returns. The
/// `safe` table rows come from the plain FactoryV13/V14 contracts instead,
/// which see the same events.
macro_rules! register_factory_sync {
    ($manifest:ident, $registry:ident, $module:ident, $etype:ident) => {{
        use crate::rindexer_lib::typings::safeindexer::events::$module::{
            $etype, ProxyCreationEvent,
        };
        let handler = ProxyCreationEvent::handler(
            |_results, _context| async move { Ok(()) },
            crate::rindexer_lib::typings::safeindexer::events::$module::no_extensions(),
        )
        .await;
        $etype::ProxyCreation(handler)
            .register($manifest, $registry)
            .await;
    }};
}

pub async fn safe_handlers(manifest_path: &PathBuf, registry: &mut EventCallbackRegistry) {
    register_factory_sync!(manifest_path, registry,
        factory_v13_common_proxy_creation_proxy, FactoryV13CommonProxyCreationProxyEventType);
    register_factory_sync!(manifest_path, registry,
        factory_v14_common_proxy_creation_proxy, FactoryV14CommonProxyCreationProxyEventType);
    register_factory_sync!(manifest_path, registry,
        factory_v13_legacy_layout_proxy_creation_proxy, FactoryV13LegacyLayoutProxyCreationProxyEventType);
    register_factory_sync!(manifest_path, registry,
        factory_v14_legacy_layout_proxy_creation_proxy, FactoryV14LegacyLayoutProxyCreationProxyEventType);
    register_factory_sync!(manifest_path, registry,
        factory_v13_modern_layout_proxy_creation_proxy, FactoryV13ModernLayoutProxyCreationProxyEventType);
    register_factory_sync!(manifest_path, registry,
        factory_v14_modern_layout_proxy_creation_proxy, FactoryV14ModernLayoutProxyCreationProxyEventType);

    register_proxy_creation!(manifest_path, registry, factory_v13, FactoryV13EventType);
    register_proxy_creation!(manifest_path, registry, factory_v14, FactoryV14EventType);

    register_common!(
        manifest_path,
        registry,
        child_common_v13,
        ChildCommonV13EventType
    );
    register_common!(
        manifest_path,
        registry,
        child_common_v14,
        ChildCommonV14EventType
    );

    register_dual!(
        manifest_path,
        registry,
        child_legacy_layout_v13,
        ChildLegacyLayoutV13EventType
    );
    register_dual!(
        manifest_path,
        registry,
        child_legacy_layout_v14,
        ChildLegacyLayoutV14EventType
    );
    register_dual!(
        manifest_path,
        registry,
        child_modern_layout_v13,
        ChildModernLayoutV13EventType
    );
    register_dual!(
        manifest_path,
        registry,
        child_modern_layout_v14,
        ChildModernLayoutV14EventType
    );
}
