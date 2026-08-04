import { TypeormDatabase } from "@subsquid/typeorm-store";
import { FACTORIES_V1_3_0, processor } from "./processor";
import {
  Safe,
  SafeSetup,
  SafeReceived,
  SafeModuleTransaction,
  SafeMultiSigTransaction,
  ExecutionSuccess,
  ExecutionFailure,
  ChangedThreshold,
  ChangedMasterCopy,
  ChangedFallbackHandler,
  ChangedGuard,
  ChangedModuleGuard,
  EnabledModule,
  DisabledModule,
  AddedOwner,
  RemovedOwner,
} from "./model";
import { events, TOPICS } from "./abi/Safe";

const legacyFactories = new Set(FACTORIES_V1_3_0);

// Proxies these factories have announced so far. Held in memory: the processor
// starts from the case's first block on every run, so the set is rebuilt from
// the same events each time rather than being state carried across runs.
//
// This is safe here and only here. The benchmark always runs a bounded range
// that ends far below the chain head, so no block this set is built from is
// ever rolled back. A head-following indexer would have to derive the set from
// the `safe` table instead — a fork that unwinds a ProxyCreation unwinds the
// row, but it cannot unwind a Set — which is a database read per log, and the
// reason it is not done here: it would measure Postgres rather than the tool.
const registered = new Set<string>();

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  const safes: Safe[] = [];
  const safeSetups: SafeSetup[] = [];
  const safeReceiveds: SafeReceived[] = [];
  const safeModuleTransactions: SafeModuleTransaction[] = [];
  const safeMultiSigTransactions: SafeMultiSigTransaction[] = [];
  const executionSuccesss: ExecutionSuccess[] = [];
  const executionFailures: ExecutionFailure[] = [];
  const changedThresholds: ChangedThreshold[] = [];
  const changedMasterCopys: ChangedMasterCopy[] = [];
  const changedFallbackHandlers: ChangedFallbackHandler[] = [];
  const changedGuards: ChangedGuard[] = [];
  const changedModuleGuards: ChangedModuleGuard[] = [];
  const enabledModules: EnabledModule[] = [];
  const disabledModules: DisabledModule[] = [];
  const addedOwners: AddedOwner[] = [];
  const removedOwners: RemovedOwner[] = [];

  for (let block of ctx.blocks) {
    const timestamp = Math.floor(block.header.timestamp / 1000);

    for (let log of block.logs) {
      if (log.topics[0] === events.ProxyCreation.topic) {
        // Same topic0, two layouts: `proxy` sits in the data payload up to
        // 1.3.0 and in a topic from 1.4.1 on, so the emitting factory decides
        // which decoder applies.
        const decoder = legacyFactories.has(log.address.toLowerCase())
          ? events.ProxyCreation
          : events.ProxyCreationIndexed;
        const { proxy, singleton } = decoder.decode(log);
        registered.add(proxy.toLowerCase());
        safes.push(
          new Safe({
            id: `${block.header.height}-${log.logIndex}`,
            address: proxy,
            singleton,
            timestamp,
          })
        );
        continue;
      }

      // Every child event is subscribed to by topic chain-wide — there is no
      // address list to give the processor — so logs from proxies these
      // factories did not create are dropped here. SafeSetup is the one that
      // never survives: a proxy emits it one log index *below* the
      // ProxyCreation that announces it, so at this point the set does not yet
      // contain the emitter. That is the honest outcome of discovering children
      // in event order, and what this case is measuring.
      if (!registered.has(log.address.toLowerCase())) continue;

      // Eight of these events made an argument `indexed` in Safe 1.4.x without
      // changing the signature, so the topic count is what says which of the
      // two decoders a log needs.
      switch (log.topics[0]) {
      case TOPICS.safeSetup: {
        const decoded = events.SafeSetup.decode(log);
        safeSetups.push(
          new SafeSetup({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            initiator: decoded.initiator,
            threshold: decoded.threshold,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.safeReceived: {
        const decoded = events.SafeReceived.decode(log);
        safeReceiveds.push(
          new SafeReceived({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            sender: decoded.sender,
            value: decoded.value,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.safeModuleTransaction: {
        const decoded = events.SafeModuleTransaction.decode(log);
        safeModuleTransactions.push(
          new SafeModuleTransaction({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            module: decoded.module,
            to: decoded.to,
            value: decoded.value,
            operation: Number(decoded.operation),
            timestamp,
          })
        );
        break;
      }
      case TOPICS.safeMultiSigTransaction: {
        const decoded = events.SafeMultiSigTransaction.decode(log);
        safeMultiSigTransactions.push(
          new SafeMultiSigTransaction({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            to: decoded.to,
            value: decoded.value,
            operation: Number(decoded.operation),
            timestamp,
          })
        );
        break;
      }
      case TOPICS.executionSuccess: {
        const decoded =
          log.topics.length > 1
            ? events.ExecutionSuccessV4.decode(log)
            : events.ExecutionSuccess.decode(log);
        executionSuccesss.push(
          new ExecutionSuccess({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            payment: decoded.payment,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.executionFailure: {
        const decoded =
          log.topics.length > 1
            ? events.ExecutionFailureV4.decode(log)
            : events.ExecutionFailure.decode(log);
        executionFailures.push(
          new ExecutionFailure({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            payment: decoded.payment,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.changedThreshold: {
        const decoded = events.ChangedThreshold.decode(log);
        changedThresholds.push(
          new ChangedThreshold({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            threshold: decoded.threshold,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.changedMasterCopy: {
        const decoded = events.ChangedMasterCopy.decode(log);
        changedMasterCopys.push(
          new ChangedMasterCopy({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            singleton: decoded.singleton,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.changedFallbackHandler: {
        const decoded =
          log.topics.length > 1
            ? events.ChangedFallbackHandlerV4.decode(log)
            : events.ChangedFallbackHandler.decode(log);
        changedFallbackHandlers.push(
          new ChangedFallbackHandler({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            handler: decoded.handler,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.changedGuard: {
        const decoded =
          log.topics.length > 1
            ? events.ChangedGuardV4.decode(log)
            : events.ChangedGuard.decode(log);
        changedGuards.push(
          new ChangedGuard({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            guard: decoded.guard,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.changedModuleGuard: {
        const decoded = events.ChangedModuleGuard.decode(log);
        changedModuleGuards.push(
          new ChangedModuleGuard({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            moduleGuard: decoded.moduleGuard,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.enabledModule: {
        const decoded =
          log.topics.length > 1
            ? events.EnabledModuleV4.decode(log)
            : events.EnabledModule.decode(log);
        enabledModules.push(
          new EnabledModule({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            module: decoded.module,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.disabledModule: {
        const decoded =
          log.topics.length > 1
            ? events.DisabledModuleV4.decode(log)
            : events.DisabledModule.decode(log);
        disabledModules.push(
          new DisabledModule({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            module: decoded.module,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.addedOwner: {
        const decoded =
          log.topics.length > 1
            ? events.AddedOwnerV4.decode(log)
            : events.AddedOwner.decode(log);
        addedOwners.push(
          new AddedOwner({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            owner: decoded.owner,
            timestamp,
          })
        );
        break;
      }
      case TOPICS.removedOwner: {
        const decoded =
          log.topics.length > 1
            ? events.RemovedOwnerV4.decode(log)
            : events.RemovedOwner.decode(log);
        removedOwners.push(
          new RemovedOwner({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            owner: decoded.owner,
            timestamp,
          })
        );
        break;
      }
      }
    }
  }

  if (safes.length > 0) await ctx.store.insert(safes);
  if (safeSetups.length > 0) await ctx.store.insert(safeSetups);
  if (safeReceiveds.length > 0) await ctx.store.insert(safeReceiveds);
  if (safeModuleTransactions.length > 0) await ctx.store.insert(safeModuleTransactions);
  if (safeMultiSigTransactions.length > 0) await ctx.store.insert(safeMultiSigTransactions);
  if (executionSuccesss.length > 0) await ctx.store.insert(executionSuccesss);
  if (executionFailures.length > 0) await ctx.store.insert(executionFailures);
  if (changedThresholds.length > 0) await ctx.store.insert(changedThresholds);
  if (changedMasterCopys.length > 0) await ctx.store.insert(changedMasterCopys);
  if (changedFallbackHandlers.length > 0) await ctx.store.insert(changedFallbackHandlers);
  if (changedGuards.length > 0) await ctx.store.insert(changedGuards);
  if (changedModuleGuards.length > 0) await ctx.store.insert(changedModuleGuards);
  if (enabledModules.length > 0) await ctx.store.insert(enabledModules);
  if (disabledModules.length > 0) await ctx.store.insert(disabledModules);
  if (addedOwners.length > 0) await ctx.store.insert(addedOwners);
  if (removedOwners.length > 0) await ctx.store.insert(removedOwners);
});
