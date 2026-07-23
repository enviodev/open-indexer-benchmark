package lbtcfull

import (
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/holiman/uint256"
)

// custom_schema.go declares derived state maintained with NO RPC calls:
// balances accumulate purely from Transfer event deltas, which is exact
// (equivalent to balanceOf()) because indexing starts at the LBTC contract's
// effective genesis block (see config.yaml). Points accrue on every
// balance-touching transfer using case_2's reference formula — balance *
// 1000/24 per hour held. The reference TS implementation also sweeps idle
// accounts hourly to keep points accruing between transfers; that sweep
// needs iteration over all tracked accounts, which the generated hot-state
// accessors (Get/GetOrCreate/Save, keyed only) don't expose, so it is not
// reproduced here — see README.md.

// pk: Address
type AccountSchema struct {
	Address       common.Address // primary key
	Balance       uint256.Int    // net LBTC balance, derived from Transfer in/out (no RPC)
	Points        float64        // balance-weighted points, accrued on every touching transfer
	LastUpdatedAt time.Time      // block timestamp of the last accrual (generated as int64 Unix ms)
	LastBlock     uint64         // block number of the last accrual
}
