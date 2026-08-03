import { TypeormDatabase } from "@subsquid/typeorm-store";
import { FACTORIES_V1_3_0, processor } from "./processor";
import { Safe, SafeModuleTransaction, SafeReceived, SafeSetup } from "./model";
import { events } from "./abi/Safe";

const legacyFactories = new Set(FACTORIES_V1_3_0);

// Proxies these factories have announced so far. Held in memory: the processor
// starts from the case's first block on every run, so the set is rebuilt from
// the same events each time rather than being state carried across runs.
const registered = new Set<string>();

processor.run(new TypeormDatabase({ supportHotBlocks: true }), async (ctx) => {
  const safes: Safe[] = [];
  const setups: SafeSetup[] = [];
  const receipts: SafeReceived[] = [];
  const moduleTransactions: SafeModuleTransaction[] = [];

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

      if (log.topics[0] === events.SafeSetup.topic) {
        // Logs arrive in chain order, and a proxy emits SafeSetup one index
        // *below* the ProxyCreation that announces it — so at this point the
        // set does not yet contain the proxy that just emitted this log, and
        // the setup is dropped. That is the honest outcome of discovering
        // children in event order, and what this case is measuring.
        if (!registered.has(log.address.toLowerCase())) continue;

        const { initiator, threshold } = events.SafeSetup.decode(log);
        setups.push(
          new SafeSetup({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            initiator,
            threshold,
            timestamp,
          })
        );
        continue;
      }

      // Both of these arrive long after the proxy was registered, so unlike
      // SafeSetup they are not lost to discovery order — the address is
      // already in the set. Subscribing by topic means the handler still sees
      // every Safe on the chain and rejects the ones this factory did not
      // create, which for SafeReceived is 52,882 logs against 413 kept.
      if (log.topics[0] === events.SafeReceived.topic) {
        if (!registered.has(log.address.toLowerCase())) continue;

        const { sender, value } = events.SafeReceived.decode(log);
        receipts.push(
          new SafeReceived({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            sender,
            value,
            timestamp,
          })
        );
        continue;
      }

      if (log.topics[0] === events.SafeModuleTransaction.topic) {
        if (!registered.has(log.address.toLowerCase())) continue;

        const { module, to, value, operation } =
          events.SafeModuleTransaction.decode(log);
        moduleTransactions.push(
          new SafeModuleTransaction({
            id: `${block.header.height}-${log.logIndex}`,
            safe: log.address,
            module,
            to,
            value,
            operation,
            timestamp,
          })
        );
      }
    }
  }

  if (safes.length > 0) await ctx.store.insert(safes);
  if (setups.length > 0) await ctx.store.insert(setups);
  if (receipts.length > 0) await ctx.store.insert(receipts);
  if (moduleTransactions.length > 0) await ctx.store.insert(moduleTransactions);
});
