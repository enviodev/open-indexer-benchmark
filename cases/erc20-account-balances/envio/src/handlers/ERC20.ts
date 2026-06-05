import { indexer } from "envio";

indexer.onEvent(
  { contract: "ERC20", event: "Transfer" },
  async ({ event, context }) => {
    const [sender, receiver] = await Promise.all([
      context.Account.getOrCreate({ id: event.params.from, balance: 0n }),
      context.Account.getOrCreate({ id: event.params.to, balance: 0n }),
    ]);
    context.Account.set({
      ...sender,
      balance: sender.balance - event.params.value,
    });
    context.Account.set({
      ...receiver,
      balance: receiver.balance + event.params.value,
    });

    context.TransferEvent.set({
      id: `${event.block.number}-${event.logIndex}`,
      amount: event.params.value,
      timestamp: event.block.timestamp,
      from: event.params.from,
      to: event.params.to,
    });
  }
);

indexer.onEvent(
  { contract: "ERC20", event: "Approval" },
  async ({ event, context }) => {
    context.Allowance.set({
      id: `${event.params.owner}-${event.params.spender}`,
      amount: event.params.value,
      owner: event.params.owner,
      spender: event.params.spender,
    });

    context.ApprovalEvent.set({
      id: `${event.block.number}-${event.logIndex}`,
      amount: event.params.value,
      timestamp: event.block.timestamp,
      owner: event.params.owner,
      spender: event.params.spender,
    });
  }
);
