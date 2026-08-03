import { ponder } from "ponder:registry";
import { safe, safeSetup } from "ponder:schema";

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
