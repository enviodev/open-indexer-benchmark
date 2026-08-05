// The slice of ABI encoding the mock chain needs: event topics, log data, and
// the return values of the handful of view calls an indexer makes while
// bootstrapping a contract.
//
// Only the two event shapes the mock contract emits are encoded here. A general
// encoder would be a package dependency and a great deal more code, and every
// byte it produced for anything else would go unread.

import { keccak256, keccakHex } from "./keccak.ts";

/** One 32-byte big-endian word, as bare hex — words are always concatenated. */
export function encodeUint256(value: bigint): string {
  if (value < 0n) throw new Error(`uint256 cannot be negative: ${value}`);
  return value.toString(16).padStart(64, "0");
}

/** An address left-padded into a 32-byte word, as a topic or a call argument. */
export function encodeAddressWord(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

/** Hex of the UTF-8 bytes of `text`, right-padded to a whole number of words. */
function encodeStringBody(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const hex = Buffer.from(bytes).toString("hex");
  const padding = (64 - (hex.length % 64)) % 64;
  return encodeUint256(BigInt(bytes.length)) + hex + "0".repeat(padding);
}

/**
 * Head-and-tail encoding of a list of dynamic strings, as the data section of
 * an event with only string parameters, or the return value of a view call
 * returning one.
 */
export function encodeStrings(values: string[]): string {
  const bodies = values.map(encodeStringBody);
  let offset = BigInt(values.length * 32);
  const heads: string[] = [];
  for (const body of bodies) {
    heads.push(encodeUint256(offset));
    offset += BigInt(body.length / 2);
  }
  return `0x${heads.join("")}${bodies.join("")}`;
}

/** topic0 of an event, from its canonical signature. */
export const eventTopic = (signature: string): string => keccakHex(signature);

/** The 4-byte selector of a function, from its canonical signature. */
export const selector = (signature: string): string => keccakHex(signature).slice(0, 10);

export const TRANSFER_SIGNATURE = "Transfer(address,address,uint256)";
export const METADATA_SIGNATURE = "MetadataUpdated(string,string)";

export const TRANSFER_TOPIC = eventTopic(TRANSFER_SIGNATURE);
export const METADATA_TOPIC = eventTopic(METADATA_SIGNATURE);

/**
 * Bloom filter over a block's logs, in the layout the Ethereum yellow paper
 * specifies: three 11-bit indices taken from the keccak hash of every address
 * and topic, each setting one bit of a 2048-bit field.
 *
 * Computed properly rather than filled with ones because indexers use it to
 * decide whether a block is worth fetching logs for. An all-ones bloom would
 * work — it can only produce false positives — but it would also mean this mock
 * never exercises the skip path a real chain puts every indexer through.
 */
export function logsBloom(entries: string[]): string {
  const bits = new Uint8Array(256);
  for (const entry of entries) {
    const hash = keccak256(Buffer.from(entry.replace(/^0x/, ""), "hex"));
    for (let pair = 0; pair < 3; pair++) {
      const index = ((hash[pair * 2] << 8) | hash[pair * 2 + 1]) & 0x07ff;
      // Bit 0 of the 2048-bit field is the most significant bit of byte 255.
      bits[255 - (index >> 3)] |= 1 << (index & 7);
    }
  }
  return `0x${Buffer.from(bits).toString("hex")}`;
}
