// The reliability scenarios, in the order a run applies them.
//
// Ordered cheapest and most fundamental first: there is no point learning how a
// tool handles a twelve-block reorg if it cannot survive its own database being
// restarted, and a run that is cut short should have covered the basics.

import { dbOutage } from "./db-outage.ts";
import { headLatency } from "./head-latency.ts";
import { hostileData } from "./hostile-data.ts";
import { reorg } from "./reorg.ts";
import { restartRecovery } from "./restart-recovery.ts";
import { rpcChaos } from "./rpc-chaos.ts";
import type { Scenario } from "../harness.ts";

export const SCENARIOS: Scenario[] = [
  restartRecovery,
  dbOutage,
  reorg,
  hostileData,
  headLatency,
  rpcChaos,
];

export const SCENARIO_KEYS = SCENARIOS.map((scenario) => scenario.key);

export function scenarioByKey(key: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.key === key);
}
