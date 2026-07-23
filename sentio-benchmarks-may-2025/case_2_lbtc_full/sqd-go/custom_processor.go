package lbtcfull

import (
	"time"

	"github.com/ethereum/go-ethereum/common"

	// generated is THIS project's own generated package; sqd-go's --state
	// scaffolds a go.mod whose module path matches this import base.
	generated "case2lbtcfull/generated"

	"github.com/subsquid-labs/sqd-go/sqd"
)

const dailyPoints = 1000.0
const secondsPerHour = 3600.0

// Process runs once per proto block. It tracks, per address, the net LBTC
// balance (derived from Transfer deltas, no RPC) and accrues points
// proportional to balance-held-over-time on every transfer that touches the
// address — mirroring case_2's reference formula:
// points += balance * (1000/24) * (secondsSinceLastUpdate/3600).
func Process(state *generated.State, block *generated.ProtoEventBlock) error {
	if state == nil || block == nil {
		return nil
	}
	var zero common.Address
	block.QueryLBTCTransfer().Map(func(ev generated.LBTCTransferProtoView) {
		value := ev.Value()
		meta := ev.Meta()
		ts := meta.BlockTimestamp

		if from := ev.From(); from != zero {
			acc := state.Account.GetOrCreate(from)
			accrue(acc, ts, meta.BlockNumber)
			// An account that already held LBTC before start_block has an
			// unknown pre-existing balance (no RPC to ask). Clamp instead of
			// underflowing: a raw uint256 Sub past zero wraps to ~2^256,
			// which then poisons every later points accrual for that
			// address. Clamping means such accounts read low until enough
			// inbound transfers cover the untracked pre-existing balance —
			// an approximation, but not a corrupted one.
			if acc.Balance.Lt(&value) {
				acc.Balance.Clear()
			} else {
				acc.Balance.Sub(&acc.Balance, &value)
			}
			state.Account.Save(acc, meta)
		}
		if to := ev.To(); to != zero {
			acc := state.Account.GetOrCreate(to)
			accrue(acc, ts, meta.BlockNumber)
			acc.Balance.Add(&acc.Balance, &value)
			state.Account.Save(acc, meta)
		}
	})
	return nil
}

// accrue evaluates the balance-held-since-last-update against the balance
// BEFORE this transfer, matching the reference implementation's use of the
// prior snapshot's balance. LastUpdatedAt is generated as a DateTime64
// column (int64 Unix milliseconds), not time.Time.
func accrue(acc *generated.Account, ts time.Time, blockNumber uint64) {
	if acc.LastUpdatedAt != 0 {
		secs := ts.Sub(time.UnixMilli(acc.LastUpdatedAt)).Seconds()
		if secs > 0 {
			acc.Points += acc.Balance.Float64() * (dailyPoints / 24) * (secs / secondsPerHour)
		}
	}
	acc.LastUpdatedAt = ts.UnixMilli()
	acc.LastBlock = blockNumber
}

func init() {
	generated.CustomProcessProtoFn = Process
	sqd.RegisterProcessor(generated.ProjectName, func() (sqd.Processor, error) {
		return generated.NewProcessor(sqd.GetProtoMode())
	})
}
