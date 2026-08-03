import { ponder } from "ponder:registry";
import {
  safe,
  safeModuleTransaction,
  safeReceived,
  safeSetup,
} from "ponder:schema";

// Both factory generations announce the same thing; only the layout behind
// `event.args` differs, and Ponder has already resolved that from each
// contract's ABI by the time the handler runs.
ponder.on("SafeProxyFactory:ProxyCreation", async ({ event, context }) => {
  await context.db.insert(safe).values({
    id: event.id,
    address: event.args.proxy,
    singleton: event.args.singleton,
    timestamp: Number(event.block.timestamp),
  });
});

ponder.on("SafeProxyFactoryModern:ProxyCreation", async ({ event, context }) => {
  await context.db.insert(safe).values({
    id: event.id,
    address: event.args.proxy,
    singleton: event.args.singleton,
    timestamp: Number(event.block.timestamp),
  });
});

// Emitted by the proxy one log index below the ProxyCreation that announces
// it. Ponder sees it because the factory's child addresses are resolved ahead
// of matching, not because the registration had already happened.
ponder.on("Safe:SafeSetup", async ({ event, context }) => {
  await context.db.insert(safeSetup).values({
    id: event.id,
    safe: event.log.address,
    initiator: event.args.initiator,
    threshold: event.args.threshold,
    timestamp: Number(event.block.timestamp),
  });
});

ponder.on("SafeModern:SafeSetup", async ({ event, context }) => {
  await context.db.insert(safeSetup).values({
    id: event.id,
    safe: event.log.address,
    initiator: event.args.initiator,
    threshold: event.args.threshold,
    timestamp: Number(event.block.timestamp),
  });
});

// The two events a registered proxy goes on emitting for the rest of its life,
// long after the registration that made it visible. Both child declarations
// carry them, since a proxy of either generation can emit either one.
for (const contract of ["Safe", "SafeModern"] as const) {
  ponder.on(`${contract}:SafeReceived`, async ({ event, context }) => {
    await context.db.insert(safeReceived).values({
      id: event.id,
      safe: event.log.address,
      sender: event.args.sender,
      value: event.args.value,
      timestamp: Number(event.block.timestamp),
    });
  });

  ponder.on(`${contract}:SafeModuleTransaction`, async ({ event, context }) => {
    await context.db.insert(safeModuleTransaction).values({
      id: event.id,
      safe: event.log.address,
      module: event.args.module,
      to: event.args.to,
      value: event.args.value,
      operation: event.args.operation,
      timestamp: Number(event.block.timestamp),
    });
  });
}
