// Case 3 (Ethereum block-level indexing) benchmark runner.
//
// The run cap is the reference Sqd (TS Subsquid) completion time for this
// case, from this case's own README performance table ("Subsquid | 1m*" —
// the asterisk marks that Subsquid's run was sparse/incomplete, 13.16%
// coverage; this implementation aims for full 0-100,000 coverage instead of
// reproducing that gap). No contracts/events/RPC — `store_blocks: true` is
// the whole config. Sequential by design — see the BENCHMARKS registry
// below. Only sqd-go is wired up here.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQD_GO_DIR = resolve(
  process.env.SQD_GO_DIR ?? resolve(__dirname, "../../../sqd-go")
);
const SQD_GO_PROJECT_DIR = resolve(__dirname, "sqd-go");
const START_BLOCK = 0;

// Reference Sqd (TS) took 1m to (sparsely) process this case (see this
// directory's README). Used as a cap, not a target.
const REFERENCE_SQD_DURATION_S = 60;

const DURATION_S = (() => {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  return flag ? parseInt(flag.split("=")[1]!, 10) : REFERENCE_SQD_DURATION_S;
})();

interface BenchmarkResult {
  name: string;
  durationS: number;
  completed: boolean;
  blocksPerSec: number;
  totalBlocks: number;
}

function buildResult(
  name: string,
  totalBlocks: number,
  durationS: number,
  completed: boolean
): BenchmarkResult {
  return {
    name,
    durationS,
    completed,
    totalBlocks,
    blocksPerSec: durationS > 0 ? totalBlocks / durationS : 0,
  };
}

async function loadEnv(path: string): Promise<Record<string, string>> {
  const text = await Bun.file(path).text().catch(() => "");
  const env: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function benchmarkSqdGo(): Promise<BenchmarkResult> {
  console.log("\n--- sqd-go ---\n");

  const caseEnv = await loadEnv(resolve(SQD_GO_PROJECT_DIR, ".env"));
  if (!caseEnv.SQD_API_TOKEN) {
    throw new Error(
      `SQD_API_TOKEN missing — set it in ${resolve(SQD_GO_PROJECT_DIR, ".env")}`
    );
  }
  const chPassword = caseEnv.CLICKHOUSE_PASSWORD ?? "sqd-clickhouse";
  const rootEnv = await loadEnv(resolve(SQD_GO_DIR, ".env"));
  const rootChPassword = rootEnv.CLICKHOUSE_PASSWORD ?? chPassword;

  console.log(`Building sqd-go in ${SQD_GO_DIR}...`);
  await Bun.$`go build -o tmp/sqd-go-bench .`.cwd(SQD_GO_DIR).quiet();

  console.log("Starting local ClickHouse (sqd-go's compose.yml)...");
  await Bun.$`docker compose up -d clickhouse`.cwd(SQD_GO_DIR).quiet();

  let chContainer = "";
  for (let i = 0; i < 30; i++) {
    chContainer = (
      await Bun.$`docker compose ps -q clickhouse`.cwd(SQD_GO_DIR).quiet().text()
    ).trim();
    if (chContainer) {
      const ready = await Bun.$`docker exec ${chContainer} clickhouse-client --password ${rootChPassword} --query "SELECT 1"`
        .quiet()
        .nothrow();
      if (ready.exitCode === 0) break;
    }
    await Bun.sleep(1000);
  }

  console.log(`Running case_3_ethereum_block, capped at ${DURATION_S}s...`);
  const proc = Bun.spawn(
    ["./tmp/sqd-go-bench", "start", SQD_GO_PROJECT_DIR, "--restart"],
    {
      cwd: SQD_GO_DIR,
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (line) console.log(`  ${line}`);
      }
    }
  })();

  const startedAt = Date.now();
  const completed = await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(DURATION_S * 1000).then(() => false),
  ]);
  const elapsedS = (Date.now() - startedAt) / 1000;

  if (completed) {
    console.log(`Completed naturally in ${elapsedS.toFixed(1)}s (cap was ${DURATION_S}s).`);
  } else {
    console.log(`Hit the ${DURATION_S}s cap; stopping...`);
    proc.kill();
    await proc.exited;
  }

  console.log("Measuring results...");
  const result =
    await Bun.$`docker exec ${chContainer} clickhouse-client --password ${rootChPassword} --query "SELECT count(), max(block_number) FROM case_3_ethereum_block.blocks"`
      .quiet()
      .nothrow()
      .text();
  const [countStr, blockStr] = result.trim().split("\t");
  const totalBlocks = parseInt(countStr ?? "0", 10) || 0;
  void blockStr;

  return buildResult("sqd-go", totalBlocks, elapsedS, completed);
}

const BENCHMARKS: Record<string, () => Promise<BenchmarkResult>> = {
  "sqd-go": benchmarkSqdGo,
};

function formatRate(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const selected = positional.length > 0 ? positional : Object.keys(BENCHMARKS);

  for (const name of selected) {
    if (!BENCHMARKS[name]) {
      console.error(
        `Unknown benchmark "${name}". Available: ${Object.keys(BENCHMARKS).join(", ")}`
      );
      process.exit(1);
    }
  }

  console.log("=== Case 3: Ethereum Block Benchmark ===");
  console.log(`Cap: ${DURATION_S}s · Start block: ${START_BLOCK}`);
  console.log(`Running sequentially: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];
  for (const name of selected) {
    const result = await BENCHMARKS[name]!();
    results.push(result);
    const status = result.completed
      ? `completed in ${result.durationS.toFixed(1)}s`
      : `hit the ${DURATION_S}s cap`;
    console.log(
      `\nSummary — ${result.name} (${status}): ${formatRate(result.blocksPerSec)} blocks/s (${result.totalBlocks} blocks)\n`
    );
  }

  console.log("\n=== Markdown ===\n");
  const header = ["| |", ...results.map((r) => ` ${r.name} |`)].join("");
  const sep = ["| --- |", ...results.map(() => " --- |")].join("");
  const blocksRow = ["| blocks/s |", ...results.map((r) => ` ${formatRate(r.blocksPerSec)} |`)].join("");
  console.log([header, sep, blocksRow].join("\n"));
}

main().catch((err) => {
  console.error("\nBenchmark failed:", err);
  process.exit(1);
});
