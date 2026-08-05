// Keccak-256, the hash Ethereum uses for event topics and function selectors.
//
// Written out here rather than pulled from a package because the mock chain is
// infrastructure: it has to start without an install step, from a checkout, in
// whatever order a scenario runs. It hashes a few hundred short strings per
// run, so a plain BigInt implementation is fast enough and much easier to read
// than a 32-bit-lane one. scripts/test-reliability.ts checks it against the
// published vectors, including the Transfer topic every indexer already knows.
//
// Note this is original Keccak padding (0x01), not the 0x06 of NIST SHA3-256.

const MASK = (1n << 64n) - 1n;

const ROUND_CONSTANTS: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rotation offsets, indexed as `ROTATIONS[x * 5 + y]`. */
const ROTATIONS = [
  0, 36, 3, 41, 18,
  1, 44, 10, 45, 2,
  62, 6, 43, 15, 61,
  28, 55, 25, 21, 56,
  27, 20, 39, 8, 14,
];

/** Rate of Keccak-256 in bytes; the remaining 64 bytes of state are capacity. */
const RATE = 136;

const rotl = (lane: bigint, bits: number): bigint =>
  bits === 0
    ? lane
    : ((lane << BigInt(bits)) | (lane >> BigInt(64 - bits))) & MASK;

/** Lane index for the (x, y) coordinates the specification is written in. */
const at = (x: number, y: number) => x + 5 * y;

function permute(state: bigint[]): void {
  for (const roundConstant of ROUND_CONSTANTS) {
    // θ — mix each column into its neighbours.
    const columns: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      columns[x] =
        state[at(x, 0)] ^ state[at(x, 1)] ^ state[at(x, 2)] ^
        state[at(x, 3)] ^ state[at(x, 4)];
    }
    for (let x = 0; x < 5; x++) {
      const d = columns[(x + 4) % 5] ^ rotl(columns[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) state[at(x, y)] ^= d;
    }

    // ρ and π — rotate every lane and move it to its new position.
    const permuted = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        permuted[at(y, (2 * x + 3 * y) % 5)] = rotl(
          state[at(x, y)],
          ROTATIONS[x * 5 + y]
        );
      }
    }

    // χ — the only non-linear step.
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[at(x, y)] =
          permuted[at(x, y)] ^
          (~permuted[at((x + 1) % 5, y)] & MASK & permuted[at((x + 2) % 5, y)]);
      }
    }

    // ι — break the symmetry the other four steps preserve.
    state[0] ^= roundConstant;
  }
}

export function keccak256(input: Uint8Array): Uint8Array {
  // Pad to a whole number of rate-sized blocks: 0x01 after the message, 0x80
  // in the final byte. Both land in the same byte for a block one short.
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE) * RATE);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let lane = 0; lane < RATE / 8; lane++) {
      // Lanes are absorbed little-endian.
      let value = 0n;
      for (let byte = 7; byte >= 0; byte--) {
        value = (value << 8n) | BigInt(padded[offset + lane * 8 + byte]);
      }
      state[lane] ^= value;
    }
    permute(state);
  }

  const out = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane++) {
    let value = state[lane];
    for (let byte = 0; byte < 8; byte++) {
      out[lane * 8 + byte] = Number(value & 0xffn);
      value >>= 8n;
    }
  }
  return out;
}

/** Keccak-256 of a UTF-8 string, as a 0x-prefixed hex digest. */
export function keccakHex(text: string): string {
  return `0x${Buffer.from(keccak256(new TextEncoder().encode(text))).toString("hex")}`;
}
