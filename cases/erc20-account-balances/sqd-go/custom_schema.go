package erc20accountbalances

import (
	"github.com/ethereum/go-ethereum/common"
	"github.com/holiman/uint256"
)

// pk: Address
type AccountSchema struct {
	Address common.Address // primary key
	Balance uint256.Int    // net balance, derived from Transfer in/out (no RPC)
}

// pk: Owner,Spender
type AllowanceSchema struct {
	Owner   common.Address
	Spender common.Address
	Amount  uint256.Int // latest approved amount
}
