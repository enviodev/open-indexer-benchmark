// Runs every scenario locally, one scenario after another.
//
//   ENVIO_API_TOKEN=your-token node scripts/run-benchmarks.ts
//   ENVIO_API_TOKEN=your-token node scripts/run-benchmarks.ts envio ponder
//   ENVIO_API_TOKEN=your-token node scripts/run-benchmarks.ts --duration=100
//   ENVIO_API_TOKEN=your-token node scripts/run-benchmarks.ts --cases=erc20-transfer-events
//
// Scenarios are sequential, mirroring CI, where each scenario's jobs only start
// once the previous scenario's are done: a throughput number is only meaningful
// if nothing else on the machine — or on the shared data endpoints — is
// competing with the run being measured. Within a scenario the runner already
// takes the indexers one at a time, for the same reason.
//
// Every argument other than --cases is forwarded to each scenario's run.ts
// untouched, so indexer selection and --duration behave exactly as they do when
// a scenario is run directly.

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASES_DIR = join(ROOT, "cases");

/** Case directories, in a stable order so runs are comparable across machines. */
function allCases(): string[] {
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(CASES_DIR, e.name, "run.ts")))
    .map((e) => e.name)
    .sort();
}

const args = process.argv.slice(2);
const casesFlag = args.find((a) => a.startsWith("--cases="));
const forwarded = args.filter((a) => a !== casesFlag);

const available = allCases();
const selected = casesFlag
  ? casesFlag
      .slice("--cases=".length)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  : available;

for (const name of selected) {
  if (!available.includes(name)) {
    console.error(`Unknown scenario "${name}". Available: ${available.join(", ")}`);
    process.exit(1);
  }
}

function runCase(name: string): Promise<number> {
  return new Promise((res, rej) => {
    const child = spawn(
      process.execPath,
      [join(CASES_DIR, name, "run.ts"), ...forwarded],
      { stdio: "inherit", cwd: ROOT }
    );
    // Ctrl-C reaches the child through the terminal's process group, and the
    // runner installs its own SIGINT handler to tear down containers. Wait for
    // it to exit rather than dying first and leaving those behind.
    child.on("error", rej);
    child.on("exit", (code, signal) => res(signal ? 1 : (code ?? 1)));
  });
}

let failed = 0;
for (const [i, name] of selected.entries()) {
  console.log(`\n=== Scenario ${i + 1}/${selected.length}: ${name} ===\n`);
  const code = await runCase(name);
  if (code !== 0) {
    // One scenario failing says nothing about the others, so keep going and
    // report at the end — a partial table beats no table.
    failed++;
    console.error(`\nScenario "${name}" exited with code ${code}.`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${selected.length} scenario(s) failed.`);
  process.exit(1);
}
