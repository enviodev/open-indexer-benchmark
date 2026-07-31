// What every driver has to provide, and the settings they share.

import type { CaseConfig } from "../case.ts";

/**
 * GraphQL port every indexer is pointed at. Only one indexer runs at a time
 * within a benchmark, and CI gives each its own runner, so a single port is
 * enough and keeps the snapshot URLs identical across drivers.
 */
export const BENCHMARK_PORT = 19_876;

export interface Snapshot {
  /** Blocks indexed past the case's start block. */
  blocks: number;
  events: number;
}

export interface Driver {
  name: string;
  dbUrl: string;
  /** Install, build and start infrastructure. Not part of the measurement. */
  prepare(): Promise<void>;
  /** Start indexing. The measured window opens when this returns. */
  launch(): Promise<void>;
  snapshot(): Promise<Snapshot | null>;
  /** Stop indexer processes, leaving the database readable. */
  stop(): Promise<void>;
  /** Tear down containers and volumes. */
  cleanup(): Promise<void>;
  /** True once the indexer exited on its own, e.g. on reaching its end block. */
  exited(): boolean;
}

export interface Ctx {
  config: CaseConfig;
  rpcUrl: string;
  endBlock: number;
}

export type DriverFactory = (ctx: Ctx) => Driver;
