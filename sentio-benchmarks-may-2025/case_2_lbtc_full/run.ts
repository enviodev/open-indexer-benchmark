// Case 2 (LBTC full: balances + points) benchmark runner.
//
// The run cap is the reference Sqd (TS Subsquid) completion time for this
// case, from this case's own README performance table ("Sqd | 34m"), not an
// arbitrary fixed window. sqd-go is expected to finish the full
// 20,600,000-22,500,000 range well inside that cap — rates are computed off
// the actual elapsed time to natural completion, not the cap. Sequential by
// design — see the BENCHMARKS registry below. Two sqd-go entries: plain
// "sqd-go" (out-of-the-box --restart) and "sqd-go-max" (--parallel-fetch +
// sqd-go's own Makefile "uniswap-fast" preset). See sqd-go/README.md for why
// this has no RPC calls (case_2's official spec uses balanceOf() RPC calls,
// which this benchmark scope excludes).
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQD_GO_DIR = resolve(
  process.env.SQD_GO_DIR ?? resolve(__dirname, "../../../sqd-go")
);
const SQD_GO_PROJECT_DIR = resolve(__dirname, "sqd-go");
const START_BLOCK = 20_600_000;

// Reference Sqd (TS) took 34m to complete this case (see this directory's
// README). Used as a cap, not a target — sqd-go is expected to finish well
// under it.
const REFERENCE_SQD_DURATION_S = 34 * 60;

const DURATION_S = (() => {
  const flag = process.argv.find((a) => a.startsWith("--duration="));
  return flag ? parseInt(flag.split("=")[1]!, 10) : REFERENCE_SQD_DURATION_S;
})();

interface ResourceStats {
  cpuUserS: number;
  cpuSysS: number;
  peakRssMB: number;
}

interface BenchmarkResult {
  name: string;
  durationS: number;
  completed: boolean;
  blocksPerSec: number;
  eventsPerSec: number;
  totalBlocks: number;
  totalEvents: number;
  totalAccounts: number;
  resourceStats: ResourceStats | null;
}

function buildResult(
  name: string,
  totalBlocks: number,
  totalEvents: number,
  totalAccounts: number,
  durationS: number,
  completed: boolean,
  resourceStats: ResourceStats | null
): BenchmarkResult {
  return {
    name,
    durationS,
    completed,
    totalBlocks,
    totalEvents,
    totalAccounts,
    resourceStats,
    blocksPerSec: durationS > 0 ? totalBlocks / durationS : 0,
    eventsPerSec: durationS > 0 ? totalEvents / durationS : 0,
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

const TIME_FLAG = process.platform === "darwin" ? "-l" : "-v";

/** Parse `/usr/bin/time`'s trailing report — BSD/macOS `-l` and GNU `-v`
 * have different formats, so both are tried. */
function parseTimeStats(text: string): ResourceStats | null {
  const user = text.match(/([\d.]+)\s+user/);
  const sys = text.match(/([\d.]+)\s+sys/);
  const rss = text.match(/(\d+)\s+maximum resident set size/);
  if (user && sys && rss) {
    return {
      cpuUserS: parseFloat(user[1]!),
      cpuSysS: parseFloat(sys[1]!),
      peakRssMB: parseInt(rss[1]!, 10) / (1024 * 1024),
    };
  }
  const userGnu = text.match(/User time \(seconds\):\s*([\d.]+)/);
  const sysGnu = text.match(/System time \(seconds\):\s*([\d.]+)/);
  const rssGnu = text.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  if (userGnu && sysGnu && rssGnu) {
    return {
      cpuUserS: parseFloat(userGnu[1]!),
      cpuSysS: parseFloat(sysGnu[1]!),
      peakRssMB: parseInt(rssGnu[1]!, 10) / 1024,
    };
  }
  return null;
}

/** Spawn `cmd` wrapped in `/usr/bin/time` + `timeout capS`, echoing output
 * live and retaining its tail to parse the resource report from. Requires
 * `cmd[0]` to be a single binary (no further process hops) — `timeout`'s
 * SIGTERM only reliably reaches its direct child. */
function startTimed(
  cmd: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  capS: number
) {
  const proc = Bun.spawn(["/usr/bin/time", TIME_FLAG, "timeout", String(capS), ...cmd], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let tail = "";
  const pump = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      tail = (tail + text).slice(-4_000);
      for (const line of text.split("\n")) {
        if (line) console.log(`  ${line}`);
      }
    }
  };
  void pump(proc.stdout as ReadableStream<Uint8Array>);
  void pump(proc.stderr as ReadableStream<Uint8Array>);
  return { proc, getStats: () => parseTimeStats(tail) };
}

// `tuned` selects between two labeled entries: "sqd-go" runs with plain
// --restart, "sqd-go-max" adds --parallel-fetch with sqd-go's own Makefile
// ("uniswap-fast") preset.
async function benchmarkSqdGoImpl(tuned: boolean): Promise<BenchmarkResult> {
  const label = tuned ? "sqd-go-max" : "sqd-go";
  console.log(`\n--- ${label} ---\n`);

  const caseEnv = await loadEnv(resolve(SQD_GO_PROJECT_DIR, ".env"));
  if (!caseEnv.SQD_API_TOKEN) {
    throw new Error(
      `SQD_API_TOKEN missing — set it in ${resolve(SQD_GO_PROJECT_DIR, ".env")}`
    );
  }
  const rootEnv = await loadEnv(resolve(SQD_GO_DIR, ".env"));
  const chPassword =
    rootEnv.CLICKHOUSE_PASSWORD ?? caseEnv.CLICKHOUSE_PASSWORD ?? "sqd-clickhouse";

  console.log("Starting local ClickHouse (sqd-go's compose.yml)...");
  await Bun.$`docker compose up -d clickhouse`.cwd(SQD_GO_DIR).quiet();

  let chContainer = "";
  for (let i = 0; i < 30; i++) {
    chContainer = (
      await Bun.$`docker compose ps -q clickhouse`.cwd(SQD_GO_DIR).quiet().text()
    ).trim();
    if (chContainer) {
      const ready = await Bun.$`docker exec ${chContainer} clickhouse-client --password ${chPassword} --query "SELECT 1"`
        .quiet()
        .nothrow();
      if (ready.exitCode === 0) break;
    }
    await Bun.sleep(1000);
  }

  // Prime go.mod/generated/the compiled processor via --state once, untimed
  // (end_block == start_block, so almost no real indexing happens). Then
  // build our own standalone runner binary from that now-scaffolded module
  // and invoke IT directly for the timed run — bypassing `go run`/`--state`'s
  // multi-hop process tree so /usr/bin/time + timeout measure/bound the
  // actual indexing process, not a wrapper.
  console.log("Priming go.mod / generated code via --state (untimed)...");
  await Bun.$`go run . start ${SQD_GO_PROJECT_DIR} --state --restart --end-block ${START_BLOCK}`
    .cwd(SQD_GO_DIR)
    .quiet();

  const runnerDir = resolve(SQD_GO_PROJECT_DIR, "tmp_runner");
  await Bun.$`rm -rf ${runnerDir}`.quiet();
  await Bun.$`mkdir -p ${runnerDir}`.quiet();
  await Bun.write(
    resolve(runnerDir, "main.go"),
    `// Code generated by sqd-go ` +
      "`--state`" +
      `; DO NOT EDIT.
package main

import (
	"os"

	_ "case2lbtcfull"

	"github.com/subsquid-labs/sqd-go/sqd"
)

func main() { os.Exit(sqd.Run(os.Args[1:])) }
`
  );
  const runnerBin = resolve(SQD_GO_PROJECT_DIR, "tmp_runner_bin");
  console.log("Building standalone runner binary...");
  await Bun.$`go build -o ${runnerBin} .`.cwd(runnerDir).quiet();

  const args = [runnerBin, "start", SQD_GO_PROJECT_DIR, "--restart"];
  const env: Record<string, string | undefined> = { ...process.env };
  if (tuned) {
    args.push("--parallel-fetch", "--no-replay");
    Object.assign(env, { SQD_PARALLEL_FETCHERS: "12", SQD_PARALLEL_RPS: "10" });
  }

  console.log(`Running ${label}, capped at ${DURATION_S}s...`);
  const startedAt = Date.now();
  const { proc, getStats } = startTimed(args, SQD_GO_DIR, env, DURATION_S);

  await proc.exited;
  const elapsedS = (Date.now() - startedAt) / 1000;
  const resourceStats = getStats();
  const completed = elapsedS < DURATION_S - 1; // timeout exits at ~capS if it had to kill

  if (completed) {
    console.log(`Completed naturally in ${elapsedS.toFixed(1)}s (cap was ${DURATION_S}s).`);
  } else {
    console.log(`Hit the ${DURATION_S}s cap.`);
  }

  console.log("Measuring results...");
  const eventsResult =
    await Bun.$`docker exec ${chContainer} clickhouse-client --password ${chPassword} --query "SELECT count(), max(block_number) FROM case_2_lbtc_full.lbtc_transfer_events"`
      .quiet()
      .nothrow()
      .text();
  const [eventsStr, blockStr] = eventsResult.trim().split("\t");
  const totalEvents = parseInt(eventsStr ?? "0", 10) || 0;
  const maxBlock = parseInt(blockStr ?? "0", 10) || 0;
  const totalBlocks = maxBlock > START_BLOCK ? maxBlock - START_BLOCK : 0;

  const accountsResult =
    await Bun.$`docker exec ${chContainer} clickhouse-client --password ${chPassword} --query "SELECT count() FROM case_2_lbtc_full.accounts_live"`
      .quiet()
      .nothrow()
      .text();
  const totalAccounts = parseInt(accountsResult.trim(), 10) || 0;

  return buildResult(
    label,
    totalBlocks,
    totalEvents,
    totalAccounts,
    elapsedS,
    completed,
    resourceStats
  );
}

async function benchmarkSqdGo(): Promise<BenchmarkResult> {
  return benchmarkSqdGoImpl(false);
}

async function benchmarkSqdGoMax(): Promise<BenchmarkResult> {
  return benchmarkSqdGoImpl(true);
}

const BENCHMARKS: Record<string, () => Promise<BenchmarkResult>> = {
  "sqd-go": benchmarkSqdGo,
  "sqd-go-max": benchmarkSqdGoMax,
};

function formatRate(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Always "Nm Ss" (or "Ss" under a minute) — never bare seconds. */
function formatDuration(s: number): string {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
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

  console.log("=== Case 2: LBTC Full (balances + points, no RPC) Benchmark ===");
  console.log(`Cap: ${formatDuration(DURATION_S)} · Start block: ${START_BLOCK}`);
  console.log(`Running sequentially: ${selected.join(", ")}\n`);

  const results: BenchmarkResult[] = [];
  const resultsLogPath = resolve(__dirname, "results.json");
  const persistResults = () =>
    Bun.write(
      resultsLogPath,
      JSON.stringify({ case: "case_2_lbtc_full", updatedAt: new Date().toISOString(), results }, null, 2)
    );

  for (const name of selected) {
    const result = await BENCHMARKS[name]!();
    results.push(result);
    await persistResults();
    const status = result.completed
      ? `completed in ${formatDuration(result.durationS)}`
      : `hit the ${formatDuration(DURATION_S)} cap`;
    const res = result.resourceStats;
    const resSuffix = res
      ? ` · CPU ${formatDuration(res.cpuUserS + res.cpuSysS)} (${res.cpuUserS.toFixed(1)}u+${res.cpuSysS.toFixed(1)}s) · peak RSS ${res.peakRssMB.toFixed(0)}MB`
      : "";
    console.log(
      `\nSummary — ${result.name} (${status}): ${formatRate(result.blocksPerSec)} blocks/s, ${formatRate(result.eventsPerSec)} events/s${resSuffix} ` +
        `(${result.totalBlocks} blocks, ${result.totalEvents} events, ${result.totalAccounts} accounts)\n`
    );
  }

  console.log("\n=== Markdown ===\n");
  const header = ["| |", ...results.map((r) => ` ${r.name} |`)].join("");
  const sep = ["| --- |", ...results.map(() => " --- |")].join("");
  const blocksRow = ["| blocks/s |", ...results.map((r) => ` ${formatRate(r.blocksPerSec)} |`)].join("");
  const eventsRow = ["| events/s |", ...results.map((r) => ` ${formatRate(r.eventsPerSec)} |`)].join("");
  const cpuRow = [
    "| CPU (user+sys) |",
    ...results.map((r) =>
      r.resourceStats ? ` ${formatDuration(r.resourceStats.cpuUserS + r.resourceStats.cpuSysS)} |` : " — |"
    ),
  ].join("");
  const memRow = [
    "| peak RSS |",
    ...results.map((r) => (r.resourceStats ? ` ${r.resourceStats.peakRssMB.toFixed(0)}MB |` : " — |")),
  ].join("");
  console.log([header, sep, blocksRow, eventsRow, cpuRow, memRow].join("\n"));
}

main().catch((err) => {
  console.error("\nBenchmark failed:", err);
  process.exit(1);
});
