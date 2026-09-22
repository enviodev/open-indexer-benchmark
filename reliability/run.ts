// Runs the reliability suite.
//
//   node reliability/run.ts                        every tool, every scenario
//   node reliability/run.ts ponder                 one tool
//   node reliability/run.ts ponder --repeats=5     more runs per scenario
//   node reliability/run.ts --scenarios=reorg-cases,db-restart
//   node reliability/run.ts ponder --group=reorgs
//
// Arguments that name a tool select it; everything else is a flag. The default
// is the whole suite. CI runs it a column at a time - one job per tool per
// group - since the scenarios take a machine to themselves anyway: a tool
// being starved of CPU by a neighbour would show up here as a tool that could
// not keep up with the head. Run by hand, they are simply run in order.
//
// Nothing here needs an API token. The chain is generated and the tools are
// pointed at it, which is the whole point.

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

// A group is a column of the published table, and it is what CI shards on: the
// nine scenarios are independent of each other and each one wants a machine to
// itself, so running a column per runner costs the wall clock of the slowest
// column rather than the sum of all nine. Naming a group here is the same
// selection by another name, so a shard can be reproduced by hand.
const groups = (flags.get("group") ?? "").split(",").filter(Boolean);
const unknownGroups = groups.filter((id) => !GROUPS.some((g) => g.id === id));
if (unknownGroups.length > 0) {
  console.error(
    `unknown group(s) ${unknownGroups.join(", ")} - known groups are ` +
      GROUPS.map((g) => g.id).join(", ")
  );
  process.exit(1);
}

const repeats = Number(flags.get("repeats") ?? 3);
if (!Number.isInteger(repeats) || repeats < 1) {
  console.error(`--repeats must be a positive integer, not "${flags.get("repeats")}"`);
  process.exit(1);
}

// Both selections narrow, so naming a group and a scenario outside it asks for
// nothing rather than for both. A dispatch that names scenarios sends every
// shard the same list, and the four shards it does not belong to are meant to
// come out empty.
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
