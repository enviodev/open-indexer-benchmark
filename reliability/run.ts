// Runs the reliability suite.
//
//   node reliability/run.ts                        every tool, every scenario
//   node reliability/run.ts ponder                 one tool
//   node reliability/run.ts ponder --repeats=5     more runs per scenario
//   node reliability/run.ts --scenarios=reorg-cases,db-restart
//   node reliability/run.ts ponder --group=reorgs
//   node reliability/run.ts --parallel=12          twelve runs at a time
//
// Arguments that name a tool select it; everything else is a flag. The default
// is the whole suite, run in order in this process. `--parallel` runs every
// run of every scenario as a job of its own, that many at once, each in a
// worker with its own ports, containers and copy of the project - which is how
// CI runs it, in one job (see reliability/lib/parallel.ts for what that costs).
//
// Nothing here needs an API token. The chain is generated and the tools are
// pointed at it, which is the whole point.

import { MAX_PARALLEL } from "./lib/parallel.ts";
import { runReliability } from "./lib/runner.ts";
import { GROUPS, SCENARIOS, scenariosIn } from "./lib/scenarios.ts";
import { absenceReason, RELIABILITY_TOOLS, runsHere } from "./lib/tools.ts";

const args = process.argv.slice(2);
const flags = new Map(
  args
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [name, value = "true"] = arg.replace(/^--/, "").split("=");
      return [name, value];
    })
);
const named = args.filter((arg) => !arg.startsWith("--"));

const unknown = named.filter((tool) => !runsHere(tool));
if (unknown.length > 0) {
  // A tool that exists but reads its own network is a different mistake from a
  // typo, and the reason is already written down, so say which it is.
  for (const tool of unknown) {
    const reason = absenceReason(tool);
    console.error(
      reason
        ? `${tool} is not run by the reliability suite: ${reason}`
        : `unknown tool "${tool}" - known tools are ${RELIABILITY_TOOLS.join(", ")}`
    );
  }
  process.exit(1);
}

const scenarios = (flags.get("scenarios") ?? "").split(",").filter(Boolean);
const unknownScenarios = scenarios.filter((id) => !SCENARIOS.some((s) => s.id === id));
if (unknownScenarios.length > 0) {
  console.error(
    `unknown scenario(s) ${unknownScenarios.join(", ")} - known scenarios are ` +
      SCENARIOS.map((s) => s.id).join(", ")
  );
  process.exit(1);
}

// A group is a column of the published table. Naming one here is the same
// selection as naming its scenarios, so a column can be re-run by hand.
const groups = (flags.get("group") ?? "").split(",").filter(Boolean);
const unknownGroups = groups.filter((id) => !GROUPS.some((g) => g.id === id));
if (unknownGroups.length > 0) {
  console.error(
    `unknown group(s) ${unknownGroups.join(", ")} - known groups are ` +
      GROUPS.map((g) => g.id).join(", ")
  );
  process.exit(1);
}

const parallel = Number(flags.get("parallel") ?? 1);
if (!Number.isInteger(parallel) || parallel < 1 || parallel > MAX_PARALLEL) {
  console.error(
    `--parallel must be an integer from 1 to ${MAX_PARALLEL}, not "${flags.get("parallel")}"`
  );
  process.exit(1);
}

const repeats = Number(flags.get("repeats") ?? 3);
if (!Number.isInteger(repeats) || repeats < 1) {
  console.error(`--repeats must be a positive integer, not "${flags.get("repeats")}"`);
  process.exit(1);
}

// Both selections narrow, so naming a group and a scenario outside it asks for
// nothing rather than for both.
const inGroups = groups.flatMap((id) => scenariosIn(id).map((s) => s.id));
const selected = (scenarios.length > 0 ? scenarios : SCENARIOS.map((s) => s.id)).filter(
  (id) => groups.length === 0 || inGroups.includes(id)
);

if (selected.length === 0) {
  console.log(
    `Nothing to run: ${groups.join(", ")} holds none of ${scenarios.join(", ")}.`
  );
  process.exit(0);
}

await runReliability({
  tools: named.length > 0 ? named.filter(runsHere) : [...RELIABILITY_TOOLS],
  scenarios: selected,
  repeats,
  parallel,
});

// A run that has published its results is finished.
//
// Leaving is explicit because the suite starts a lot of things - a chain, a
// database, an indexer and whatever that indexer starts - and any one of them
// can leave a handle behind that keeps the event loop alive. In a terminal
// that is a prompt that does not come back. In CI it is a job that hangs until
// its timeout, which here is five hours, and a hung job reports nothing at
// all: the results are already printed above and would be thrown away.
//
// Whatever is still open is named first, so the cause is a thing someone can
// go and close rather than a thing they have to reproduce.
const open = [...new Set(process.getActiveResourcesInfo())].filter(
  (handle) => handle !== "TTYWrap" && handle !== "FileHandle"
);
if (open.length > 0) {
  console.log(`\nStill open at exit, and closed by leaving: ${open.join(", ")}`);
}
process.exit(0);
