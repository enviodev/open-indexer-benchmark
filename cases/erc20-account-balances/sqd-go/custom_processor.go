package erc20accountbalances

import (
	"github.com/ethereum/go-ethereum/common"

	// generated is THIS project's own generated package; sqd-go's --state
	// scaffolds a go.mod whose module path matches this import base.
	generated "erc20accountbalances/generated"

	"github.com/subsquid-labs/sqd-go/sqd"
)

// Process runs once per proto block. It maintains, per address, a net
// balance derived from Transfer deltas, and per (owner, spender) pair the
// latest Approval amount — no RPC calls, matching this case's own reference
// logic ("if it exists, subtract/add; otherwise create with zero balance").
func Process(state *generated.State, block *generated.ProtoEventBlock) error {
	if state == nil || block == nil {
		return nil
	}
	var zero common.Address
	block.QueryRocketTokenRETHTransfer().Map(func(ev generated.RocketTokenRETHTransferProtoView) {
		value := ev.Value()
		meta := ev.Meta()

		if from := ev.From(); from != zero {
			acc := state.Account.GetOrCreate(from)
			// An account holding tokens from before start_block has an
			// untracked pre-existing balance (no RPC to ask, same
			// zero-start assumption the reference implementations make).
			// Clamp instead of letting a uint256 Sub underflow and wrap.
			if acc.Balance.Lt(&value) {
				acc.Balance.Clear()
			} else {
				acc.Balance.Sub(&acc.Balance, &value)
			}
			state.Account.Save(acc, meta)
		}
		if to := ev.To(); to != zero {
			acc := state.Account.GetOrCreate(to)
			acc.Balance.Add(&acc.Balance, &value)
			state.Account.Save(acc, meta)
		}
	})
	block.QueryRocketTokenRETHApproval().Map(func(ev generated.RocketTokenRETHApprovalProtoView) {
		meta := ev.Meta()
		allowance := state.Allowance.GetOrCreate(ev.Owner(), ev.Spender())
		allowance.Amount = ev.Value()
		state.Allowance.Save(allowance, meta)
	})
	return nil
}

func init() {
	generated.CustomProcessProtoFn = Process
	sqd.RegisterProcessor(generated.ProjectName, func() (sqd.Processor, error) {
		return generated.NewProcessor(sqd.GetProtoMode())
	})
}
