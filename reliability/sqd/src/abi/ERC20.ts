import * as p from "@subsquid/evm-codec";
import { event, indexed, viewFun } from "@subsquid/evm-abi";

// Written by hand rather than generated. `squid-evm-typegen` produces this same
// shape from abi/ERC20.json, and the generated file for a full ERC-20 is a few
// hundred lines of bindings this case never calls; three entries are easier to
// read and cannot drift from the ABI without someone noticing.
export const events = {
  Transfer: event(
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "Transfer(address,address,uint256)",
    { from: indexed(p.address), to: indexed(p.address), value: p.uint256 }
  ),
};

export const functions = {
  symbol: viewFun("0x95d89b41", "symbol()", {}, p.string),
  name: viewFun("0x06fdde03", "name()", {}, p.string),
};
