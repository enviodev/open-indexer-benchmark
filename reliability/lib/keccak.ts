// keccak-256 and the logs bloom it builds, for the blocks the mock chain
// replays from a recording.
//
// A replayed block serves the projects' contract in place of the token it was
// recorded with, so its bloom has to be rebuilt from the logs it now carries:
// Ponder refuses a log its block's bloom does not hold, and Envio skips asking
// again for a block whose bloom rules its events out. The harness has no
// dependencies, and Node's sha3-256 pads differently from keccak, so this is
// the permutation itself - small, and checked against known digests and
// against the blooms a real chain served.

const ROUNDS = 24;
const MASK = (1n << 64n) - 1n;

const ROUND_CONSTANTS: bigint[] = (() => {
  const out: bigint[] = [];
  let r = 1;
  for (let round = 0; round < ROUNDS; round++) {
    let constant = 0n;
    for (let j = 0; j < 7; j++) {
      if (r & 1) constant |= 1n << BigInt((1 << j) - 1);
      r = r & 0x80 ? ((r << 1) ^ 0x71) & 0xff : (r << 1) & 0xff;
    }
    out.push(constant);
  }
  return out;
})();

const ROTATIONS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const rotate = (lane: bigint, by: number) =>
  by === 0 ? lane : ((lane << BigInt(by)) | (lane >> BigInt(64 - by))) & MASK;

function permute(state: bigint[]) {
  for (let round = 0; round < ROUNDS; round++) {
    const c = Array.from({ length: 5 }, (_, x) =>
      state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
    );
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotate(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) state[y + x] ^= d;
    }
    const b: bigint[] = new Array(25);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + ((2 * x + 3 * y) % 5) * 5] = rotate(state[x + y * 5], ROTATIONS[x][y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 25; y += 5) {
        state[y + x] = b[y + x] ^ (~b[y + ((x + 1) % 5)] & MASK & b[y + ((x + 2) % 5)]);
      }
    }
    state[0] ^= ROUND_CONSTANTS[round];
  }
}

const RATE = 136;

export function keccak256(data: Uint8Array): Uint8Array {
  const padded = new Uint8Array(Math.ceil((data.length + 1) / RATE) * RATE);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const state: bigint[] = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let lane = 0; lane < RATE / 8; lane++) {
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

const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));

/** The three bloom bits a value sets, cached: a block's logs repeat a few addresses and topics. */
const bitsCache = new Map<string, number[]>();
function bloomBits(value: string): number[] {
  const key = value.toLowerCase();
  let bits = bitsCache.get(key);
  if (!bits) {
    const hash = keccak256(fromHex(key));
    bits = [0, 2, 4].map((i) => ((hash[i] << 8) | hash[i + 1]) & 2047);
    bitsCache.set(key, bits);
  }
  return bits;
}

/** The 2048-bit logs bloom of a set of logs, as a block or a receipt carries it. */
export function logsBloom(logs: { address: string; topics: string[] }[]): string {
  const bloom = new Uint8Array(256);
  for (const log of logs) {
    for (const value of [log.address, ...log.topics]) {
      for (const bit of bloomBits(value)) bloom[255 - (bit >> 3)] |= 1 << (bit & 7);
    }
  }
  return `0x${Buffer.from(bloom).toString("hex")}`;
}

/** Whether a bloom may hold a value: every bit the value sets is set. */
export function bloomMayContain(bloom: string, value: string): boolean {
  const bytes = Buffer.from(bloom.replace(/^0x/, ""), "hex");
  return bloomBits(value).every((bit) => (bytes[255 - (bit >> 3)] & (1 << (bit & 7))) !== 0);
}
