import { struct, u64, u8 } from "@subsquid/borsh";
import { instruction } from "./abi.support";

export const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// The SPL Token program dispatches on a single leading byte rather than an
// eight-byte Anchor discriminator, and the two transfer instructions differ in
// their account list: `transferChecked` names the mint it moves, `transfer`
// does not.
export const instructions = {
  transfer: instruction(
    { d1: "0x03" },
    { source: 0, destination: 1, authority: 2 },
    struct({ amount: u64 })
  ),
  transferChecked: instruction(
    { d1: "0x0c" },
    { source: 0, mint: 1, destination: 2, authority: 3 },
    struct({ amount: u64, decimals: u8 })
  ),
};
