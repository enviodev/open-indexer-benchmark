// A stretch of a real chain, as reliability/record.ts captured it, for the mock
// chain to replay.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

/** A log as the recorded chain served it. */
export interface RecordedLog {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  transactionIndex: string;
  logIndex: string;
  [field: string]: unknown;
}

/** A transaction as the recorded chain served it in a full block. */
export interface RecordedTransaction {
  hash: string;
  from: string;
  to: string | null;
  type: string;
  gas: string;
  [field: string]: unknown;
}

/** A block with its full transactions and every log it holds. */
export interface RecordedBlock {
  hash: string;
  timestamp: string;
  transactions: RecordedTransaction[];
  logs: RecordedLog[];
  [field: string]: unknown;
}

export interface Recording {
  /** The endpoint it was read from. */
  source: string;
  chainId: number;
  recordedAt: string;
  /** The chain's average time between blocks over the stretch. */
  blockTimeMs: number;
  /** The ERC-20 contract whose Transfers the replay serves as the projects' token. */
  token: string;
  blocks: RecordedBlock[];
}

export const BASE_RECORDING = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "recordings",
  "base-head.json.gz"
);

const loaded = new Map<string, Recording>();

/** Read once per process: the chain serves it and the scenario paces itself by it. */
export function loadRecording(path = BASE_RECORDING): Recording {
  let recording = loaded.get(path);
  if (!recording) {
    recording = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as Recording;
    loaded.set(path, recording);
  }
  return recording;
}
